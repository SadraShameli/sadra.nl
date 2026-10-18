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
    DataTableAlign,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import { CurrencyAmount } from '~/lib/accounting/core/money';
import { CredentialRole } from '~/lib/accounting/credentials/index';
import { formatDisplayDate } from '~/lib/format';
import { api } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { DIRECTION_OPTIONS, DirectionBadge } from './DirectionBadge';
import { NoConnectionState } from './NoConnectionState';
import { columnWhenAnyRow } from './tableColumns';
import { useActiveCredentials } from './useActiveCredentials';

const MATCHED = '__matched__';
const UNKNOWN = '__unknown__';
const LOOKBACK_DAYS = 90;

type TxnRow = RawTransaction & { match: null | TransactionMatch };

const toIso = (d: Date): string => d.toISOString().slice(0, 10);

const defaultRange = (): DateRange => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - LOOKBACK_DAYS);
    return { from, to };
};

export function TransactionsBrowser() {
    const {
        accounting,
        isLoading: isCredentialsLoading,
        source,
    } = useActiveCredentials();
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
    const isLoading =
        isCredentialsLoading || (!!credentialId && txnsQ.isPending);
    const hasExternalFilters = dateRange !== initialDateRange;

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
                    <span className="font-mono text-xs">
                        {CurrencyAmount.format({
                            amount: row.original.sourceAmount,
                            currency: row.original.sourceCurrency,
                        })}
                    </span>
                ),
                header: 'Amount',
                meta: { align: DataTableAlign.End },
            },
            ...columnWhenAnyRow<TxnRow>(rows, (r) => r.sourceFee !== 0, {
                accessorKey: 'sourceFee',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {CurrencyAmount.format({
                            amount: row.original.sourceFee,
                            currency:
                                row.original.sourceFeeCurrency ??
                                row.original.sourceCurrency,
                        })}
                    </span>
                ),
                header: 'Fee',
                meta: { align: DataTableAlign.End },
            }),
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
        [rows],
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
            ) : isLoading || credentialId ? (
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={(table) =>
                        hasExternalFilters || hasActiveTableFilter(table) ? (
                            <EmptyState
                                description="No transactions match these filters."
                                icon={ArrowLeftRight}
                                title="No matches"
                            />
                        ) : (
                            <EmptyState
                                description={`This source has no transactions in the last ${String(LOOKBACK_DAYS)} days. Pick an earlier transaction date to look further back.`}
                                icon={ArrowLeftRight}
                                title="No transactions yet"
                            />
                        )
                    }
                    filterPlaceholder="Search transactions…"
                    hasExternalFilters={hasExternalFilters}
                    headerActions={(table) => (
                        <div className="flex flex-wrap items-center gap-2">
                            <FilterSelect
                                label="Direction"
                                onValueChange={(v) =>
                                    table
                                        .getColumn('direction')
                                        ?.setFilterValue(v)
                                }
                                options={DIRECTION_OPTIONS}
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
                    isLoading={isLoading}
                    onResetFilters={() => setDateRange(initialDateRange)}
                    rowId={(r) => r.txnId}
                    showFilter
                />
            ) : (
                <NoConnectionState role={CredentialRole.Transactions} />
            )}
        </ToolPanel>
    );
}
