'use client';

import { ArrowLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import type {
    RawTransaction,
    TransactionMatch,
} from '~/lib/accounting/core/types';

import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import { CredentialRole } from '~/lib/accounting/credentials/index';
import { formatDisplayDate } from '~/lib/format';
import { api } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { DirectionBadge } from './DirectionBadge';
import { useActiveCredentials } from './useActiveCredentials';

const MATCHED = '__matched__';
const UNKNOWN = '__unknown__';
const LOOKBACK_DAYS = 90;

type TxnRow = RawTransaction & { match: null | TransactionMatch };

const amountFormat = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
});

const toIso = (d: Date): string => d.toISOString().slice(0, 10);

const defaultRange = (): DateRange => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - LOOKBACK_DAYS);
    return { from, to };
};

export function TransactionsBrowser() {
    const { accounting, source } = useActiveCredentials();
    const credentialId = source?.id ?? '';
    const accountingCredentialId = accounting?.id ?? '';
    const [initialDateRange] = useState<DateRange>(defaultRange);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        initialDateRange,
    );

    const range = useMemo(() => {
        return dateRange?.from
            ? {
                  from: toIso(dateRange.from),
                  to: toIso(dateRange.to ?? new Date()),
              }
            : null;
    }, [dateRange]);

    const txnsQ = api.accounting.transactions.list.useQuery(
        {
            accountingCredentialId: accountingCredentialId || undefined,
            credentialId,
            from: range?.from ?? '',
            to: range?.to ?? '',
        },
        { enabled: !!credentialId && !!range },
    );

    const rows = useMemo(() => txnsQ.data ?? [], [txnsQ.data]);

    const columns = useMemo<DataTableColumn<TxnRow>[]>(
        () => [
            {
                accessorKey: 'txnId',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.txnId}
                    </span>
                ),
                header: 'ID',
            },
            {
                accessorKey: 'date',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {formatDisplayDate(row.original.date)}
                    </span>
                ),
                enableSorting: true,
                header: 'Date',
            },
            {
                accessorKey: 'direction',
                cell: ({ row }) => (
                    <DirectionBadge direction={row.original.direction} />
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Dir',
            },
            {
                accessorKey: 'merchant',
                cell: ({ row }) => (
                    <Badge className="w-fit">{row.original.merchant}</Badge>
                ),
                header: 'Merchant',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'sourceAmount',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.direction === 'IN'
                                ? 'font-mono text-xs text-success'
                                : 'font-mono text-xs text-destructive'
                        }
                    >
                        {amountFormat.format(row.original.sourceAmount)}{' '}
                        {row.original.sourceCurrency}
                    </span>
                ),
                header: 'Amount',
            },
            {
                accessorKey: 'sourceFee',
                cell: ({ row }) =>
                    row.original.sourceFee > 0 ? (
                        <span className="font-mono text-xs text-muted-foreground">
                            {amountFormat.format(row.original.sourceFee)}{' '}
                            {row.original.sourceFeeCurrency ??
                                row.original.sourceCurrency}
                        </span>
                    ) : (
                        '-'
                    ),
                header: 'Fee',
            },
            {
                accessorKey: 'match',
                cell: ({ row }) => {
                    const match = row.original.match;
                    return match ? (
                        <div className="flex flex-col items-start gap-0.5">
                            <Badge>{match.display}</Badge>
                            <span className="font-mono text-xs text-muted-foreground">
                                {match.ledgerLabel}
                            </span>
                        </div>
                    ) : (
                        <Badge>Unknown</Badge>
                    );
                },
                filterFn: (row, _columnId, filterValue: string) => {
                    const match = row.original.match;
                    return filterValue === MATCHED
                        ? match !== null
                        : filterValue !== UNKNOWN || match === null;
                },
                header: 'Match',
            },
        ],
        [],
    );

    return (
        <ToolPanel
            description={
                <span className="inline-flex flex-wrap gap-x-4">
                    <ActiveConnectionNote
                        credential={source}
                        role={CredentialRole.Transactions}
                    />
                    <ActiveConnectionNote
                        credential={accounting}
                        role={CredentialRole.Accounting}
                    />
                </span>
            }
            title="Transactions"
        >
            {txnsQ.error ? (
                <EmptyState
                    description={txnsQ.error.message}
                    title="Could not fetch transactions"
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={(table) => (
                        <EmptyState
                            description={
                                credentialId
                                    ? hasActiveTableFilter(table)
                                        ? 'No transactions match this filter.'
                                        : 'Fetched transactions from this credential will appear here.'
                                    : 'Pick a transactions credential above to load transactions.'
                            }
                            icon={ArrowLeftRight}
                            title={
                                credentialId
                                    ? 'No transactions yet'
                                    : 'No credential selected'
                            }
                        />
                    )}
                    filterPlaceholder="Search transactions…"
                    hasExternalFilters={dateRange !== initialDateRange}
                    headerActions={(table) => (
                        <div className="flex flex-wrap items-center gap-2">
                            <FilterSelect
                                label="Direction"
                                onValueChange={(v) =>
                                    table
                                        .getColumn('direction')
                                        ?.setFilterValue(v)
                                }
                                options={[
                                    { label: 'In', value: 'IN' },
                                    { label: 'Out', value: 'OUT' },
                                ]}
                                placeholder="All directions"
                                value={
                                    table
                                        .getColumn('direction')
                                        ?.getFilterValue() as string | undefined
                                }
                            />
                            <FilterSelect
                                label="Match"
                                onValueChange={(v) =>
                                    table.getColumn('match')?.setFilterValue(v)
                                }
                                options={[
                                    { label: 'Matched', value: MATCHED },
                                    { label: 'Unknown', value: UNKNOWN },
                                ]}
                                placeholder="All matches"
                                value={
                                    table
                                        .getColumn('match')
                                        ?.getFilterValue() as string | undefined
                                }
                            />
                            <FilterDateRange
                                align="end"
                                label="Transaction date"
                                onChange={setDateRange}
                                placeholder="Any date"
                                value={dateRange}
                            />
                        </div>
                    )}
                    initialSorting={[{ desc: true, id: 'date' }]}
                    isLoading={!!credentialId && txnsQ.isPending}
                    onResetFilters={() => setDateRange(initialDateRange)}
                    pageSize={25}
                    rowId={(r) => r.txnId}
                    showFilter
                />
            )}
        </ToolPanel>
    );
}
