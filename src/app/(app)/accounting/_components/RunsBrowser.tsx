'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { ChevronRight, History } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge, type BadgeProperties } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import { type RunStatus } from '~/lib/accounting/runs/types';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

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
    const credentialsQ = api.accounting.credentials.list.useQuery();
    const runsQ = api.accounting.runs.list.useQuery({
        limit: PAGE_SIZE,
        offset,
    });

    const labelByCredentialId = useMemo(() => {
        const map = new Map<string, string>();
        const credentials = credentialsQ.data ?? [];
        for (const c of credentials) map.set(c.id, c.label);
        return map;
    }, [credentialsQ.data]);

    const rows = runsQ.data ?? [];
    const hasPrevious = offset > 0;
    const hasNext = rows.length === PAGE_SIZE;

    const columns = useMemo<ColumnDef<RunRow>[]>(
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
                                    description="Plan a run from the dashboard to see it appear here."
                                    icon={History}
                                    title="No runs yet"
                                />
                            }
                            initialSorting={[{ desc: true, id: 'createdAt' }]}
                            isLoading={runsQ.isPending}
                            pageSize={null}
                            rowId={(r) => r.id}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                                {rows.length > 0
                                    ? `${offset + 1}–${offset + rows.length}`
                                    : '0 results'}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    disabled={!hasPrevious || runsQ.isPending}
                                    onClick={() =>
                                        setOffset(
                                            Math.max(0, offset - PAGE_SIZE),
                                        )
                                    }
                                    size="sm"
                                    variant="outline"
                                >
                                    Previous
                                </Button>
                                <Button
                                    disabled={!hasNext || runsQ.isPending}
                                    onClick={() =>
                                        setOffset(offset + PAGE_SIZE)
                                    }
                                    size="sm"
                                    variant="outline"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
