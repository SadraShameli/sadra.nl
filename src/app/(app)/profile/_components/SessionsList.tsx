'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { DataTable } from '~/components/ui/DataTable';
import { cn } from '~/lib/utils';
import { api } from '~/trpc/react';

type Row = {
    current: boolean;
    ipAddress: null | string;
    lastUsedAt: Date | string;
    sessionToken: string;
    userAgent: null | string;
};

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

    const rows = sessionsQuery.data ?? [];
    const hasOthers = rows.some((r) => !r.current);

    const columns = useMemo<ColumnDef<Row>[]>(
        () => [
            {
                cell: ({ row }) => {
                    const { isMobile } = describeUserAgent(
                        row.original.userAgent,
                    );
                    const Icon = isMobile ? Smartphone : Monitor;
                    return <Icon className="size-4 text-muted-foreground" />;
                },
                enableSorting: false,
                header: '',
                id: 'icon',
            },
            {
                cell: ({ row }) => {
                    const { label } = describeUserAgent(row.original.userAgent);
                    return (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-white">
                                {label}
                            </span>
                            {row.original.current && (
                                <Badge variant="default">Current</Badge>
                            )}
                        </div>
                    );
                },
                header: 'Session',
                id: 'session',
            },
            {
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {maskIp(row.original.ipAddress)}
                    </span>
                ),
                enableSorting: false,
                header: 'IP',
                id: 'ip',
            },
            {
                accessorFn: (row) => new Date(row.lastUsedAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(
                            new Date(row.original.lastUsedAt),
                            {
                                addSuffix: true,
                            },
                        )}
                    </span>
                ),
                header: 'Last active',
                id: 'lastUsedAt',
            },
            {
                cell: ({ row }) =>
                    row.original.current ? null : (
                        <Button
                            className="ml-auto"
                            disabled={pending || revoke.isPending}
                            onClick={() =>
                                startTransition(() =>
                                    revoke.mutateAsync({
                                        sessionToken: row.original.sessionToken,
                                    }),
                                )
                            }
                            size="sm"
                            variant="outline"
                        >
                            Revoke
                        </Button>
                    ),
                enableSorting: false,
                header: '',
                id: 'actions',
            },
        ],
        [pending, revoke],
    );

    if (sessionsQuery.isLoading) {
        return (
            <p className="text-sm text-muted-foreground">Loading sessions…</p>
        );
    }

    return (
        <div className={cn('app-profile__sessions', 'flex flex-col gap-3')}>
            <DataTable<Row, unknown>
                columns={columns}
                data={rows}
                emptyMessage="No active sessions."
                pageSize={null}
                rowClassName={(r) => (r.current ? 'bg-primary/5' : undefined)}
                rowId={(r) => r.sessionToken}
                tableClassName="min-w-max whitespace-nowrap"
            />

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
