'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import type {
    RawTransaction,
    TransactionMatch,
} from '~/lib/accounting/core/types';

import { Badge } from '~/components/ui/Badge';
import { Card, CardContent } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
import { DateRangePicker } from '~/components/ui/DatePicker';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { api } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { DirectionBadge } from './DirectionBadge';
import { useActiveCredentials } from './useActiveCredentials';

const ALL = '__all__';
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
    const [directionFilter, setDirectionFilter] = useState<string>(ALL);
    const [matchFilter, setMatchFilter] = useState<string>(ALL);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        defaultRange,
    );

    const range = useMemo(() => {
        if (!dateRange?.from) return null;
        return {
            from: toIso(dateRange.from),
            to: toIso(dateRange.to ?? new Date()),
        };
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

    const rows = useMemo(() => {
        const all = txnsQ.data ?? [];
        return all.filter((t) => {
            if (directionFilter !== ALL && t.direction !== directionFilter)
                return false;
            if (matchFilter === MATCHED && t.match === null) return false;
            return matchFilter !== UNKNOWN || t.match === null;
        });
    }, [txnsQ.data, directionFilter, matchFilter]);

    const hasFilters = directionFilter !== ALL || matchFilter !== ALL;
    const reset = () => {
        setDirectionFilter(ALL);
        setMatchFilter(ALL);
    };

    const columns = useMemo<ColumnDef<TxnRow>[]>(
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
                        {row.original.date}
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
                header: 'Dir',
            },
            {
                accessorKey: 'merchant',
                cell: ({ row }) => (
                    <Badge className="w-fit" variant="outline">
                        {row.original.merchant}
                    </Badge>
                ),
                header: 'Merchant',
            },
            {
                accessorKey: 'sourceAmount',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.direction === 'IN'
                                ? 'font-mono text-xs text-emerald-300'
                                : 'font-mono text-xs text-rose-300'
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
                        <span className="font-mono text-[10px] text-muted-foreground">
                            {amountFormat.format(row.original.sourceFee)}{' '}
                            {row.original.sourceFeeCurrency ??
                                row.original.sourceCurrency}
                        </span>
                    ) : (
                        '—'
                    ),
                header: 'Fee',
            },
            {
                accessorKey: 'match',
                cell: ({ row }) => {
                    const match = row.original.match;
                    if (!match) {
                        return (
                            <Badge
                                className="font-mono text-[10px] text-amber-300"
                                variant="outline"
                            >
                                Unknown
                            </Badge>
                        );
                    }
                    return (
                        <div className="flex flex-col items-start gap-0.5">
                            <Badge variant="outline">{match.display}</Badge>
                            <span className="font-mono text-[10px] text-muted-foreground">
                                {match.ledgerLabel}
                            </span>
                        </div>
                    );
                },
                header: 'Match',
            },
        ],
        [],
    );

    return (
        <Card>
            <CardContent>
                {txnsQ.error ? (
                    <EmptyState
                        description={txnsQ.error.message}
                        title="Could not fetch transactions"
                    />
                ) : (
                    <DataTable
                        columns={columns}
                        data={rows}
                        emptyState={
                            <EmptyState
                                description={
                                    credentialId
                                        ? hasFilters
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
                        }
                        filterPlaceholder="Search transactions…"
                        headerActions={
                            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                                <ClearFiltersButton
                                    active={hasFilters}
                                    className="hidden md:flex"
                                    onReset={reset}
                                />
                                <ActiveConnectionNote
                                    credential={source}
                                    roleNoun="transaction source"
                                />
                                <ActiveConnectionNote
                                    credential={accounting}
                                    roleNoun="accounting credential"
                                />
                                <DateRangePicker
                                    align="end"
                                    className="h-8 w-fit shrink-0 text-xs"
                                    onChange={setDateRange}
                                    placeholder="Any date"
                                    value={dateRange}
                                />
                                <Select
                                    onValueChange={setDirectionFilter}
                                    value={directionFilter}
                                >
                                    <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>
                                            All directions
                                        </SelectItem>
                                        <SelectItem value="IN">In</SelectItem>
                                        <SelectItem value="OUT">Out</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select
                                    onValueChange={setMatchFilter}
                                    value={matchFilter}
                                >
                                    <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>
                                            All matches
                                        </SelectItem>
                                        <SelectItem value={MATCHED}>
                                            Matched
                                        </SelectItem>
                                        <SelectItem value={UNKNOWN}>
                                            Unknown
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <ClearFiltersButton
                                    active={hasFilters}
                                    className="md:hidden"
                                    onReset={reset}
                                />
                            </div>
                        }
                        initialSorting={[{ desc: true, id: 'date' }]}
                        isLoading={!!credentialId && txnsQ.isPending}
                        pageSize={25}
                        rowId={(r) => r.txnId}
                        showFilter
                    />
                )}
            </CardContent>
        </Card>
    );
}
