'use client';

import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    useTransition,
} from 'react';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';

import { RelativeTime } from '~/components/RelativeTime';
import { RowActionKind, rowActionsColumn } from '~/components/RowActionsMenu';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { EmptyState, NoMatchesState } from '~/components/ui/empty-state';
import { FilterSelect } from '~/components/ui/filter-select';
import { authClient } from '~/lib/auth/client';
import { cn } from '~/lib/utilities';

interface SessionRow {
    createdAt: Date;
    expiresAt: Date;
    id: string;
    ipAddress?: null | string;
    token: string;
    updatedAt: Date;
    userAgent?: null | string;
}

const STATUS_VALUES = ['all', 'current', 'others'] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];
const STATUS_LABEL: Record<StatusFilter, string> = {
    all: 'All sessions',
    current: 'Current only',
    others: 'Other sessions',
};

export function SessionsList() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sessions, setSessions] = useState<SessionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const { data: currentSession } = authClient.useSession();
    const currentToken = currentSession?.session.token ?? null;

    const refetch = useCallback(async () => {
        const result = await authClient.listSessions();
        if (result.data) setSessions(result.data);
    }, []);

    useEffect(() => {
        void refetch().finally(() => setLoading(false));
    }, [refetch]);

    const allRows = useMemo(
        () =>
            sessions.map((s) => ({
                ...s,
                current: s.token === currentToken,
                ipAddress: s.ipAddress ?? null,
                userAgent: s.userAgent ?? null,
            })),
        [sessions, currentToken],
    );
    const rows = useMemo(() => {
        if (statusFilter === 'current') return allRows.filter((r) => r.current);
        return statusFilter === 'others'
            ? allRows.filter((r) => !r.current)
            : allRows;
    }, [allRows, statusFilter]);
    const hasOthers = allRows.some((r) => !r.current);
    const hasFilters = statusFilter !== 'all';
    const reset = () => setStatusFilter('all');

    type Row = (typeof allRows)[number];

    const columns = useMemo<DataTableColumn<Row>[]>(
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
                meta: { isHiddenInCards: true },
            },
            {
                accessorFn: (r) => describeUserAgent(r.userAgent).label,
                cell: ({ row }) => {
                    const { label } = describeUserAgent(row.original.userAgent);
                    return (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                                {label}
                            </span>
                            {row.original.current && <Badge>Current</Badge>}
                        </div>
                    );
                },
                header: 'Session',
                id: 'session',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (r) => maskIp(r.ipAddress),
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {maskIp(row.original.ipAddress)}
                    </span>
                ),
                header: 'IP',
                id: 'ip',
            },
            {
                accessorFn: (r) => new Date(r.updatedAt).getTime(),
                cell: ({ row }) => (
                    <RelativeTime
                        className="text-xs text-muted-foreground"
                        value={row.original.updatedAt}
                    />
                ),
                header: 'Last active',
                id: 'updatedAt',
            },
            rowActionsColumn<Row>({
                actionsOf: (session) =>
                    session.current
                        ? []
                        : [
                              {
                                  confirm: {
                                      confirmLabel: 'Revoke',
                                      description:
                                          'That device is signed out and has to sign in again.',
                                      title: `Revoke ${sessionLabel(session)}?`,
                                  },
                                  icon: LogOut,
                                  isDestructive: true,
                                  kind: RowActionKind.Select,
                                  label: 'Revoke',
                                  onSelect: () =>
                                      startTransition(async () => {
                                          const result =
                                              await authClient.revokeSession({
                                                  token: session.token,
                                              });
                                          if (result.error) {
                                              toast.error(
                                                  result.error.message ??
                                                      'Could not revoke.',
                                              );
                                              return;
                                          }
                                          toast.success('Session revoked.');
                                          await refetch();
                                      }),
                              },
                          ],
                isPendingOf: () => pending,
                labelOf: sessionLabel,
            }),
        ],
        [pending, refetch],
    );

    return (
        <div className={cn('app-profile__sessions', 'flex flex-col gap-3')}>
            <DataTable<Row>
                columns={columns}
                data={rows}
                emptyState={(table) =>
                    hasFilters || hasActiveTableFilter(table) ? (
                        <NoMatchesState icon={Monitor} noun="sessions" />
                    ) : (
                        <EmptyState icon={Monitor} title="No active sessions" />
                    )
                }
                filterPlaceholder="Search sessions…"
                hasExternalFilters={hasFilters}
                headerActions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FilterSelect
                            label="Session"
                            onValueChange={(v) =>
                                setStatusFilter(
                                    STATUS_VALUES.find((s) => s === v) ?? 'all',
                                )
                            }
                            options={STATUS_VALUES.filter(
                                (s) => s !== 'all',
                            ).map((s) => ({
                                label: STATUS_LABEL[s],
                                value: s,
                            }))}
                            placeholder={STATUS_LABEL.all}
                            value={
                                statusFilter === 'all'
                                    ? undefined
                                    : statusFilter
                            }
                        />
                    </div>
                }
                isLoading={loading}
                onResetFilters={reset}
                pageSize={null}
                rowId={(r) => r.token}
                showFilter
            />

            {hasOthers && (
                <div className="flex justify-end">
                    <Button
                        disabled={pending}
                        onClick={() =>
                            startTransition(async () => {
                                const result =
                                    await authClient.revokeOtherSessions();
                                if (result.error) {
                                    toast.error(
                                        result.error.message ??
                                            'Could not revoke.',
                                    );
                                    return;
                                }
                                toast.success('All other sessions signed out.');
                                await refetch();
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

function describeUserAgent(ua: null | string | undefined): {
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

function maskIp(ip: null | string | undefined): string {
    if (!ip) return '-';
    if (ip === '::1' || ip === '127.0.0.1') return 'localhost';
    if (ip.includes(':')) {
        const groups = ip.split(':');
        const isLocalhost = groups.every(
            (g, index) =>
                /^0*$/.test(g) ||
                (index === groups.length - 1 && /^0*1$/.test(g)),
        );
        if (isLocalhost) return 'localhost';
        const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
        if (match?.[1]) return match[1];
    }
    return ip;
}

function sessionLabel(session: {
    ipAddress: null | string;
    userAgent: null | string;
}): string {
    return `${describeUserAgent(session.userAgent).label}, ${maskIp(session.ipAddress)}`;
}
