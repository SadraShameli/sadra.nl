'use client';

import { type SortingState } from '@tanstack/react-table';
import { ChevronRight, History } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { linkRowAction, rowActionsColumn } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import {
    DataTable,
    type DataTableColumn,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { FilterSelect } from '~/components/ui/filter-select';
import { Eur } from '~/lib/accounting/core/money';
import {
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/index';
import {
    RUN_SORT_KEYS,
    RUN_STATUSES,
    type RunStatus,
} from '~/lib/accounting/runs/types';
import { formatDisplayDate, formatDisplayDateTime } from '~/lib/format';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

import { RunStatusBadge, runStatusLabel } from './RunStatusBadge';

const ALL = '__all__';
const DEFAULT_SORTING: SortingState = [{ desc: true, id: 'createdAt' }];
const PAGE_SIZE = 20;

type RunRow = RouterOutputs['accounting']['runs']['list'][number];

export function RunsBrowser() {
    const [offset, setOffset] = useState(0);
    const [statusFilter, setStatusFilter] = useState<RunStatus | typeof ALL>(
        ALL,
    );
    const [targetFilter, setTargetFilter] = useState<string>(ALL);
    const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
    const credentialsQ = api.accounting.credentials.list.useQuery();
    const sort = sorting[0];
    const runsQ = api.accounting.runs.list.useQuery({
        accountingCredentialId: targetFilter === ALL ? undefined : targetFilter,
        limit: PAGE_SIZE,
        offset,
        sortBy: RUN_SORT_KEYS.find((k) => k === sort?.id),
        sortDir: sort?.desc === false ? 'asc' : 'desc',
        status: statusFilter === ALL ? undefined : statusFilter,
    });

    const hasFilters = statusFilter !== ALL || targetFilter !== ALL;
    const reset = () => {
        setStatusFilter(ALL);
        setTargetFilter(ALL);
        setOffset(0);
    };
    const sortBy = (next: SortingState) => {
        setSorting(next.length > 0 ? next : DEFAULT_SORTING);
        setOffset(0);
    };

    const labelByCredentialId = useMemo(() => {
        const map = new Map<string, string>();
        const credentials = credentialsQ.data ?? [];
        for (const c of credentials) map.set(c.id, c.label);
        return map;
    }, [credentialsQ.data]);

    const targets = useMemo(
        () =>
            (credentialsQ.data ?? []).filter(
                (c) =>
                    CredentialRegistry.instance.get(c.kind)?.role ===
                    CredentialRole.Accounting,
            ),
        [credentialsQ.data],
    );

    const rows = runsQ.data ?? [];

    const columns = useMemo<DataTableColumn<RunRow>[]>(
        () => [
            {
                accessorKey: 'createdAt',
                cell: ({ row }) => (
                    <Link
                        className="font-mono text-xs text-foreground hover:underline"
                        href={routes.accounting.run(row.original.id)}
                        prefetch
                    >
                        {formatDisplayDateTime(row.original.createdAt)}
                    </Link>
                ),
                header: 'Created',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'startDate',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        since {formatDisplayDate(row.original.startDate)}
                    </span>
                ),
                header: 'Start date',
            },
            {
                accessorKey: 'status',
                cell: ({ row }) => (
                    <RunStatusBadge status={row.original.status} />
                ),
                header: 'Status',
            },
            {
                accessorFn: (r) =>
                    r.accountingCredentialId
                        ? (labelByCredentialId.get(r.accountingCredentialId) ??
                          r.accountingCredentialId)
                        : '',
                cell: ({ row }) => {
                    const id = row.original.accountingCredentialId;
                    return (
                        <span className="text-xs text-muted-foreground">
                            {id ? (labelByCredentialId.get(id) ?? id) : '-'}
                        </span>
                    );
                },
                header: 'Target',
                id: 'accountingCredentialId',
            },
            {
                accessorFn: (r) => r.summary.bookingsCount,
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.summary.bookingsCount}
                    </span>
                ),
                header: 'Bookings',
                id: 'bookingsCount',
            },
            {
                accessorFn: (r) => r.summary.totalEur,
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {Eur.format(row.original.summary.totalEur)}
                    </span>
                ),
                header: 'Total',
                id: 'totalEur',
            },
            {
                accessorFn: (r) => r.summary.unknownsCount,
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.summary.unknownsCount > 0
                                ? 'font-mono text-xs text-warning'
                                : 'font-mono text-xs text-muted-foreground'
                        }
                    >
                        {row.original.summary.unknownsCount}
                    </span>
                ),
                header: 'Unknowns',
                id: 'unknownsCount',
            },
            rowActionsColumn<RunRow>({
                actionsOf: (run) => [
                    linkRowAction({
                        href: routes.accounting.run(run.id),
                        icon: ChevronRight,
                        label: 'Open',
                    }),
                ],
                labelOf: (run) =>
                    `run created ${formatDisplayDateTime(run.createdAt)}`,
            }),
        ],
        [labelByCredentialId],
    );

    return (
        <ToolPanel title="Runs">
            {runsQ.error ? (
                <EmptyState
                    description={runsQ.error.message}
                    title="Could not fetch runs"
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={(table) => (
                        <EmptyState
                            description={
                                hasFilters || hasActiveTableFilter(table)
                                    ? 'No runs match the current filters.'
                                    : 'Plan a run from the dashboard to see it appear here.'
                            }
                            icon={History}
                            title={
                                hasFilters || hasActiveTableFilter(table)
                                    ? 'No matches'
                                    : 'No runs yet'
                            }
                        />
                    )}
                    filterPlaceholder="Search runs…"
                    hasExternalFilters={hasFilters}
                    headerActions={
                        <div className="flex flex-wrap items-center gap-2">
                            <FilterSelect
                                label="Status"
                                onValueChange={(v) => {
                                    setStatusFilter(
                                        RUN_STATUSES.find((s) => s === v) ??
                                            ALL,
                                    );
                                    setOffset(0);
                                }}
                                options={RUN_STATUSES.map((s) => ({
                                    label: runStatusLabel(s),
                                    value: s,
                                }))}
                                placeholder="All statuses"
                                value={
                                    statusFilter === ALL
                                        ? undefined
                                        : statusFilter
                                }
                            />
                            <FilterSelect
                                label="Target"
                                onValueChange={(v) => {
                                    setTargetFilter(v ?? ALL);
                                    setOffset(0);
                                }}
                                options={targets.map((c) => ({
                                    label: c.label,
                                    value: c.id,
                                }))}
                                placeholder="All targets"
                                value={
                                    targetFilter === ALL
                                        ? undefined
                                        : targetFilter
                                }
                            />
                        </div>
                    }
                    initialSorting={DEFAULT_SORTING}
                    isLoading={runsQ.isPending}
                    onResetFilters={reset}
                    onSortingChange={sortBy}
                    pageSize={null}
                    rowId={(r) => r.id}
                    serverPagination={{
                        hasNextPage: rows.length === PAGE_SIZE,
                        isPending: runsQ.isPending,
                        onPageIndexChange: (pageIndex) =>
                            setOffset(pageIndex * PAGE_SIZE),
                        pageIndex: offset / PAGE_SIZE,
                        pageSize: PAGE_SIZE,
                    }}
                    showFilter
                />
            )}
        </ToolPanel>
    );
}
