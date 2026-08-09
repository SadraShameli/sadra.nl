'use client';

import { type SortingState } from '@tanstack/react-table';
import { format } from 'date-fns';
import { ChevronRight, History } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge, type BadgeProperties } from '~/components/ui/Badge';
import { Card, CardContent } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import {
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/index';
import {
    RUN_SORT_KEYS,
    RUN_STATUSES,
    type RunStatus,
} from '~/lib/accounting/runs/types';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

const ALL = '__all__';
const DEFAULT_SORTING: SortingState = [{ desc: true, id: 'createdAt' }];
const PAGE_SIZE = 20;

type RunRow = RouterOutputs['accounting']['runs']['list'][number];

const STATUS_VARIANT: Record<RunStatus, BadgeProperties['variant']> = {
    failed: 'destructive',
    partial: 'warning',
    planned: 'outline',
    posted: 'success',
    posting: 'warning',
};

const formatEur = (n: number) =>
    new Intl.NumberFormat('en-US', {
        currency: 'EUR',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: 'currency',
    }).format(n);

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
                        className="font-mono text-xs text-white hover:underline"
                        href={routes.accounting.run(row.original.id)}
                    >
                        {format(row.original.createdAt, 'PPp')}
                    </Link>
                ),
                header: 'Created',
            },
            {
                accessorKey: 'startDate',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        since {row.original.startDate}
                    </span>
                ),
                header: 'Start date',
            },
            {
                accessorKey: 'status',
                cell: ({ row }) => (
                    <Badge variant={STATUS_VARIANT[row.original.status]}>
                        {row.original.status}
                    </Badge>
                ),
                header: 'Status',
            },
            {
                accessorKey: 'accountingCredentialId',
                cell: ({ row }) => {
                    const id = row.original.accountingCredentialId;
                    return (
                        <span className="text-xs text-muted-foreground">
                            {id ? (labelByCredentialId.get(id) ?? id) : '—'}
                        </span>
                    );
                },
                header: 'Target',
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
                        {formatEur(row.original.summary.totalEur)}
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
                                ? 'font-mono text-xs text-amber-300'
                                : 'font-mono text-xs text-muted-foreground'
                        }
                    >
                        {row.original.summary.unknownsCount}
                    </span>
                ),
                header: 'Unknowns',
                id: 'unknownsCount',
            },
            {
                cell: ({ row }) => (
                    <Link href={routes.accounting.run(row.original.id)}>
                        <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                ),
                header: '',
                id: 'open',
            },
        ],
        [labelByCredentialId],
    );

    return (
        <Card>
            <CardContent>
                {runsQ.error ? (
                    <EmptyState
                        description={runsQ.error.message}
                        title="Could not fetch runs"
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        <DataTable
                            columns={columns}
                            data={rows}
                            emptyState={
                                <EmptyState
                                    description={
                                        hasFilters
                                            ? 'No runs match the current filters.'
                                            : 'Plan a run from the dashboard to see it appear here.'
                                    }
                                    icon={History}
                                    title={
                                        hasFilters
                                            ? 'No matches'
                                            : 'No runs yet'
                                    }
                                />
                            }
                            headerActions={
                                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                                    <ClearFiltersButton
                                        active={hasFilters}
                                        className="hidden md:flex"
                                        onReset={reset}
                                    />
                                    <Select
                                        onValueChange={(v) => {
                                            setStatusFilter(
                                                v as RunStatus | typeof ALL,
                                            );
                                            setOffset(0);
                                        }}
                                        value={statusFilter}
                                    >
                                        <SelectTrigger className="h-8 w-40 shrink-0 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ALL}>
                                                All statuses
                                            </SelectItem>
                                            {RUN_STATUSES.map((s) => (
                                                <SelectItem key={s} value={s}>
                                                    {s}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        onValueChange={(v) => {
                                            setTargetFilter(v);
                                            setOffset(0);
                                        }}
                                        value={targetFilter}
                                    >
                                        <SelectTrigger className="h-8 w-48 shrink-0 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ALL}>
                                                All targets
                                            </SelectItem>
                                            {targets.map((c) => (
                                                <SelectItem
                                                    key={c.id}
                                                    value={c.id}
                                                >
                                                    {c.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            }
                            initialSorting={DEFAULT_SORTING}
                            isLoading={runsQ.isPending}
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
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
