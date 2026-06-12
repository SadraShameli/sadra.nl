'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
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
import { MUTATION_TYPES } from '~/lib/accounting/providers/eboekhouden/enums';
import { api } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { useActiveCredentials } from './useActiveCredentials';

const ALL = '__all__';
const PAGE_SIZE = 100;

type Mutation = {
    date: string;
    description: null | string;
    externalId: number;
    ledgerId: number;
    paymentReference: null | string;
    type: string;
};

const MUTATION_TYPE_LABEL: Record<keyof typeof MUTATION_TYPES, string> = {
    GENERAL_JOURNAL: 'General journal',
    INVOICE_PAYMENT_RECEIVED: 'Invoice payment received',
    INVOICE_PAYMENT_SENT: 'Invoice payment sent',
    INVOICE_RECEIVED: 'Invoice received',
    INVOICE_SENT: 'Invoice sent',
    MONEY_RECEIVED: 'Money received',
    MONEY_SENT: 'Money sent',
};

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
    (
        Object.entries(MUTATION_TYPES) as [
            keyof typeof MUTATION_TYPES,
            string,
        ][]
    ).map(([name, code]) => [code, MUTATION_TYPE_LABEL[name]]),
);

const toIso = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export function MutationsBrowser() {
    const { accounting } = useActiveCredentials();
    const credentialId = accounting?.id ?? '';
    const [typeFilter, setTypeFilter] = useState<string>(ALL);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [offset, setOffset] = useState(0);

    const dateFrom = dateRange?.from ? toIso(dateRange.from) : undefined;
    const dateTo = dateRange?.to
        ? toIso(dateRange.to)
        : dateRange?.from
          ? toIso(dateRange.from)
          : undefined;

    const mutationsQ = api.accounting.mutations.list.useQuery(
        {
            credentialId,
            dateFrom,
            dateTo,
            limit: PAGE_SIZE,
            offset,
        },
        { enabled: !!credentialId },
    );

    const rows = useMemo(() => {
        const all = mutationsQ.data ?? [];
        if (typeFilter === ALL) return all;
        return all.filter((m) => m.type === typeFilter);
    }, [mutationsQ.data, typeFilter]);

    const hasFilters = typeFilter !== ALL || Boolean(dateRange?.from);
    const reset = () => {
        setTypeFilter(ALL);
        setDateRange(undefined);
        setOffset(0);
    };

    const columns = useMemo<ColumnDef<Mutation>[]>(
        () => [
            {
                accessorKey: 'externalId',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.externalId}
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
                accessorKey: 'type',
                cell: ({ row }) => (
                    <Badge variant="outline">
                        {TYPE_LABEL[row.original.type] ?? row.original.type}
                    </Badge>
                ),
                header: 'Type',
            },
            {
                accessorKey: 'ledgerId',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.ledgerId}
                    </span>
                ),
                header: 'Ledger',
            },
            {
                accessorKey: 'description',
                cell: ({ row }) => row.original.description ?? '—',
                header: 'Description',
            },
            {
                accessorKey: 'paymentReference',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.paymentReference ?? '—'}
                    </span>
                ),
                header: 'Reference',
            },
        ],
        [],
    );

    const hasPrev = offset > 0;
    const hasNext = rows.length === PAGE_SIZE;

    return (
        <Card>
            <CardContent>
                {mutationsQ.error ? (
                    <EmptyState
                        description={mutationsQ.error.message}
                        title="Could not fetch mutations"
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        <DataTable
                            columns={columns}
                            data={rows}
                            emptyState={
                                <EmptyState
                                    description={
                                        credentialId
                                            ? hasFilters
                                                ? 'No mutations match this filter.'
                                                : 'Fetched mutations from this credential will appear here.'
                                            : 'Pick an accounting credential above to load mutations.'
                                    }
                                    icon={ListChecks}
                                    title={
                                        credentialId
                                            ? 'No mutations yet'
                                            : 'No credential selected'
                                    }
                                />
                            }
                            filterPlaceholder="Search mutations…"
                            headerActions={
                                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                                    <ClearFiltersButton
                                        active={hasFilters}
                                        className="hidden md:flex"
                                        onReset={reset}
                                    />
                                    <ActiveConnectionNote
                                        credential={accounting}
                                        roleNoun="accounting credential"
                                    />
                                    <DateRangePicker
                                        align="end"
                                        className="h-8 w-fit shrink-0 text-xs"
                                        onChange={(r) => {
                                            setDateRange(r);
                                            setOffset(0);
                                        }}
                                        placeholder="Any date"
                                        value={dateRange}
                                    />
                                    <Select
                                        onValueChange={(v) => {
                                            setTypeFilter(v);
                                            setOffset(0);
                                        }}
                                        value={typeFilter}
                                    >
                                        <SelectTrigger className="h-8 w-48 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ALL}>
                                                All types
                                            </SelectItem>
                                            {(
                                                Object.entries(
                                                    MUTATION_TYPES,
                                                ) as [
                                                    keyof typeof MUTATION_TYPES,
                                                    string,
                                                ][]
                                            ).map(([name, code]) => (
                                                <SelectItem
                                                    key={code}
                                                    value={code}
                                                >
                                                    {MUTATION_TYPE_LABEL[name]}
                                                </SelectItem>
                                            ))}
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
                            isLoading={!!credentialId && mutationsQ.isPending}
                            pageSize={25}
                            rowId={(r) => String(r.externalId)}
                            showFilter
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                                {rows.length > 0
                                    ? `${offset + 1}–${offset + rows.length}`
                                    : '0 results'}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    disabled={!hasPrev || mutationsQ.isPending}
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
                                    disabled={!hasNext || mutationsQ.isPending}
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
