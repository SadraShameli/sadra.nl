'use client';

import { formatDistanceToNow } from 'date-fns';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Separator } from '~/components/ui/Separator';
import { api } from '~/trpc/react';

function describeUserAgent(ua: string | null): {
    label: string;
    isMobile: boolean;
} {
    if (!ua) return { label: 'Unknown device', isMobile: false };
    const parsed = new UAParser(ua).getResult();
    const browser = parsed.browser.name ?? 'Browser';
    const os = parsed.os.name ?? 'Unknown OS';
    const isMobile = parsed.device.type === 'mobile';
    return { label: `${browser} on ${os}`, isMobile };
}

function maskIp(ip: string | null): string {
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

export function SessionsList() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const sessionsQuery = api.session.list.useQuery();
    const revoke = api.session.revoke.useMutation({
        onSuccess: () => {
            toast.success('Session revoked.');
            void sessionsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
    });
    const revokeAll = api.session.revokeAllOthers.useMutation({
        onSuccess: () => {
            toast.success('All other sessions signed out.');
            void sessionsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
    });

    if (sessionsQuery.isLoading) {
        return (
            <p className="text-sm text-muted-foreground">Loading sessions…</p>
        );
    }

    const rows = sessionsQuery.data ?? [];
    const hasOthers = rows.some((r) => !r.current);

    return (
        <div className="space-y-3">
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No active sessions.
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map((row) => {
                        const { label, isMobile } = describeUserAgent(
                            row.userAgent,
                        );
                        const Icon = isMobile ? Smartphone : Monitor;
                        const last = formatDistanceToNow(
                            new Date(row.lastUsedAt),
                            { addSuffix: true },
                        );
                        return (
                            <div
                                key={row.sessionToken}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3"
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
                                        size="sm"
                                        variant="outline"
                                        disabled={pending || revoke.isPending}
                                        onClick={() =>
                                            startTransition(() =>
                                                revoke.mutateAsync({
                                                    sessionToken:
                                                        row.sessionToken,
                                                }),
                                            )
                                        }
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
                <>
                    <Separator />
                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={pending || revokeAll.isPending}
                            onClick={() =>
                                startTransition(async () => {
                                    await revokeAll.mutateAsync();
                                    router.refresh();
                                })
                            }
                        >
                            <LogOut className="mr-1 size-3.5" />
                            Sign out everywhere else
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
