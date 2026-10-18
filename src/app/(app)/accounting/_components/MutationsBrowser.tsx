'use client';

import { ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import type { ExternalId, LedgerId } from '~/lib/accounting/core/ids';

import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import { CredentialRole } from '~/lib/accounting/credentials/index';
import { MutationType } from '~/lib/accounting/providers/eboekhouden/enums';
import { formatDisplayDate } from '~/lib/format';
import { api } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { useActiveCredentials } from './useActiveCredentials';

const ALL = '__all__';
const PAGE_SIZE = 100;

type Mutation = {
    date: string;
    description: null | string;
    externalId: ExternalId;
    ledgerId: LedgerId;
    paymentReference: null | string;
    type: string;
};

const MUTATION_TYPE_LABEL: Record<MutationType, string> = {
    [MutationType.GeneralJournal]: 'General journal',
    [MutationType.InvoicePaymentReceived]: 'Invoice payment received',
    [MutationType.InvoicePaymentSent]: 'Invoice payment sent',
    [MutationType.InvoiceReceived]: 'Invoice received',
    [MutationType.InvoiceSent]: 'Invoice sent',
    [MutationType.MoneyReceived]: 'Money received',
    [MutationType.MoneySent]: 'Money sent',
};

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

    const allMutations = useMemo(
        () => mutationsQ.data ?? [],
        [mutationsQ.data],
    );
    const typeOptions = useMemo(
        () => [...new Set(allMutations.map((m) => m.type))],
        [allMutations],
    );
    const rows = useMemo(() => {
        return typeFilter === ALL
            ? allMutations
            : allMutations.filter((m) => m.type === typeFilter);
    }, [allMutations, typeFilter]);

    const hasFilters = typeFilter !== ALL || Boolean(dateRange?.from);
    const reset = () => {
        setTypeFilter(ALL);
        setDateRange(undefined);
        setOffset(0);
    };

    const columns = useMemo<DataTableColumn<Mutation>[]>(
        () => [
            {
                accessorKey: 'externalId',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.externalId}
                    </span>
                ),
                header: 'ID',
                meta: { isRowHeader: true },
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
                accessorKey: 'type',
                cell: ({ row }) => (
                    <Badge>
                        {(MUTATION_TYPE_LABEL as Record<string, string>)[
                            row.original.type
                        ] ?? row.original.type}
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
                cell: ({ row }) => row.original.description ?? '-',
                header: 'Description',
            },
            {
                accessorKey: 'paymentReference',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {row.original.paymentReference ?? '-'}
                    </span>
                ),
                header: 'Reference',
            },
        ],
        [],
    );

    return (
        <ToolPanel
            description={
                <ActiveConnectionNote
                    credential={accounting}
                    role={CredentialRole.Accounting}
                />
            }
            title="Mutations"
        >
            {mutationsQ.error ? (
                <EmptyState
                    description={mutationsQ.error.message}
                    title="Could not fetch mutations"
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
                    hasExternalFilters={hasFilters}
                    headerActions={
                        <div className="flex flex-wrap items-center gap-2">
                            <FilterSelect
                                label="Type"
                                onValueChange={(v) => {
                                    setTypeFilter(v ?? ALL);
                                    setOffset(0);
                                }}
                                options={typeOptions.map((code) => ({
                                    label:
                                        (
                                            MUTATION_TYPE_LABEL as Record<
                                                string,
                                                string
                                            >
                                        )[code] ?? code,
                                    value: code,
                                }))}
                                placeholder="All types"
                                value={
                                    typeFilter === ALL ? undefined : typeFilter
                                }
                            />
                            <FilterDateRange
                                align="end"
                                label="Mutation date"
                                onChange={(r) => {
                                    setDateRange(r);
                                    setOffset(0);
                                }}
                                placeholder="Any date"
                                value={dateRange}
                            />
                        </div>
                    }
                    initialSorting={[{ desc: true, id: 'date' }]}
                    isLoading={!!credentialId && mutationsQ.isPending}
                    onResetFilters={reset}
                    rowId={(r) => r.externalId}
                    serverPagination={{
                        hasNextPage: rows.length === PAGE_SIZE,
                        isPending: mutationsQ.isPending,
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
