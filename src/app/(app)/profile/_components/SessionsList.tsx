'use client';

import { formatDistanceToNow } from 'date-fns';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utils';
import { api } from '~/trpc/react';

export function SessionsList() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const sessionsQuery = api.session.list.useQuery();
    const revoke = api.session.revoke.useMutation({
        onError: (e) => toast.error(e.message),
        onSuccess: () => {
            toast.success('Session revoked.');
            void sessionsQuery.refetch();
        },
    });
    const revokeAll = api.session.revokeAllOthers.useMutation({
        onError: (e) => toast.error(e.message),
        onSuccess: () => {
            toast.success('All other sessions signed out.');
            void sessionsQuery.refetch();
        },
    });

    if (sessionsQuery.isLoading) {
        return (
            <p className="text-sm text-muted-foreground">Loading sessions…</p>
        );
    }

    const rows = sessionsQuery.data ?? [];
    const hasOthers = rows.some((r) => !r.current);

    return (
        <div className={cn('app-profile__sessions', 'flex flex-col gap-3')}>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No active sessions.
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map((row) => {
                        const { isMobile, label } = describeUserAgent(
                            row.userAgent,
                        );
                        const Icon = isMobile ? Smartphone : Monitor;
                        const last = formatDistanceToNow(
                            new Date(row.lastUsedAt),
                            { addSuffix: true },
                        );
                        return (
                            <div
                                className={cn(
                                    'app-profile__session-item',
                                    'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3',
                                )}
                                data-state={row.current ? 'current' : undefined}
                                key={row.sessionToken}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-white">
                                                {label}
                                            </span>
                                            {row.current && (
                                                <Badge variant="default">
                                                    Current
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {maskIp(row.ipAddress)} · last
                                            active {last}
                                        </p>
                                    </div>
                                </div>
                                {!row.current && (
                                    <Button
                                        className="ml-auto"
                                        disabled={pending || revoke.isPending}
                                        onClick={() =>
                                            startTransition(() =>
                                                revoke.mutateAsync({
                                                    sessionToken:
                                                        row.sessionToken,
                                                }),
                                            )
                                        }
                                        size="sm"
                                        variant="outline"
                                    >
                                        Revoke
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {hasOthers && (
                <div className="flex justify-end">
                    <Button
                        disabled={pending || revokeAll.isPending}
                        onClick={() =>
                            startTransition(async () => {
                                await revokeAll.mutateAsync();
                                router.refresh();
                            })
                        }
                        size="sm"
                        variant="outline"
                    >
                        <LogOut className="mr-1 size-3.5" />
                        Sign out everywhere else
                    </Button>
                </div>
            )}
        </div>
    );
}

function describeUserAgent(ua: null | string): {
    isMobile: boolean;
    label: string;
} {
    if (!ua) return { isMobile: false, label: 'Unknown device' };
    const parsed = new UAParser(ua).getResult();
    const browser = parsed.browser.name ?? 'Browser';
    const os = parsed.os.name ?? 'Unknown OS';
    const isMobile = parsed.device.type === 'mobile';
    return { isMobile, label: `${browser} on ${os}` };
}

function maskIp(ip: null | string): string {
    if (!ip) return '—';
    if (ip === '::1' || ip === '127.0.0.1') return 'localhost';
    if (ip.includes(':')) {
        const parts = ip.split(':').slice(0, 4);
        return `${parts.join(':')}::/64`;
    }
    const octets = ip.split('.');
    if (octets.length === 4) {
        return `${octets[0]}.${octets[1]}.${octets[2]}.x`;
    }
    return ip;
}
