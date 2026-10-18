'use client';

import { ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { z } from 'zod';

import { MissingValue } from '~/components/MissingValue';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import {
    DATA_TABLE_PAGE_SIZE,
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import { Skeleton } from '~/components/ui/skeleton';
import { Eur } from '~/lib/accounting/core/money';
import { CredentialRole } from '~/lib/accounting/credentials/index';
import {
    MUTATION_TYPE_LABEL,
    MutationType,
} from '~/lib/accounting/providers/eboekhouden/enums';
import { formatDisplayDate } from '~/lib/format';
import { api, type RouterOutputs } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { NoConnectionState } from './NoConnectionState';
import { columnWhenAnyRow } from './tableColumns';
import { useActiveCredentials } from './useActiveCredentials';

const ALL = '__all__';

type Mutation = RouterOutputs['accounting']['mutations']['list'][number];

const toIso = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const mutationTypeLabel = (type: string): string => {
    const known = z.enum(MutationType).safeParse(type);
    return known.success ? MUTATION_TYPE_LABEL[known.data] : type;
};

export function MutationsBrowser() {
    const { accounting, isLoading: isCredentialsLoading } =
        useActiveCredentials();
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
            limit: DATA_TABLE_PAGE_SIZE,
            offset,
        },
        { enabled: !!credentialId },
    );
    const countQ = api.accounting.mutations.count.useQuery(
        { credentialId, dateFrom, dateTo },
        { enabled: !!credentialId },
    );
    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );

    const ledgerLabelById = useMemo(
        () =>
            new Map(
                (ledgersQ.data ?? []).map((ledger) => [
                    ledger.externalId,
                    `${ledger.code} ${ledger.description}`,
                ]),
            ),
        [ledgersQ.data],
    );
    const isLedgersPending = !!credentialId && ledgersQ.isPending;
    const ledgersErrorMessage = ledgersQ.error?.message ?? null;

    const allMutations = useMemo(
        () => mutationsQ.data ?? [],
        [mutationsQ.data],
    );
    const totalCount = countQ.data ?? undefined;
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
    const isLoading =
        isCredentialsLoading || (!!credentialId && mutationsQ.isPending);
    const isCollectionEmpty =
        !isLoading && !hasFilters && offset === 0 && allMutations.length === 0;
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
                    <Badge>{mutationTypeLabel(row.original.type)}</Badge>
                ),
                header: 'Type',
            },
            {
                accessorFn: (r) => ledgerLabelById.get(r.ledgerId) ?? '',
                cell: ({ row }) => {
                    if (isLedgersPending) {
                        return <Skeleton className="h-4 w-32" />;
                    }
                    if (ledgersErrorMessage !== null) {
                        return (
                            <MissingValue
                                reason={`Ledger ${row.original.ledgerId} has no name here because the ledger list could not be loaded: ${ledgersErrorMessage}`}
                            />
                        );
                    }
                    const label = ledgerLabelById.get(row.original.ledgerId);
                    return label === undefined ? (
                        <MissingValue
                            reason={`Ledger ${row.original.ledgerId} is not in the ledger list of this backend.`}
                        />
                    ) : (
                        <span className="text-xs">{label}</span>
                    );
                },
                header: 'Ledger',
                id: 'ledger',
            },
            ...columnWhenAnyRow<Mutation>(
                allMutations,
                (m) => m.amount !== null,
                {
                    accessorKey: 'amount',
                    cell: ({ row }) =>
                        row.original.amount === null ? (
                            <MissingValue />
                        ) : (
                            <span className="font-mono text-xs">
                                {Eur.format(row.original.amount)}
                            </span>
                        ),
                    enableSorting: true,
                    header: 'Amount',
                    meta: { align: DataTableAlign.End },
                },
            ),
            ...columnWhenAnyRow<Mutation>(
                allMutations,
                (m) => m.description !== null,
                {
                    accessorKey: 'description',
                    cell: ({ row }) =>
                        row.original.description ?? <MissingValue />,
                    header: 'Description',
                },
            ),
            ...columnWhenAnyRow<Mutation>(
                allMutations,
                (m) => m.paymentReference !== null,
                {
                    accessorKey: 'paymentReference',
                    cell: ({ row }) =>
                        row.original.paymentReference === null ? (
                            <MissingValue />
                        ) : (
                            <span className="font-mono text-xs text-muted-foreground">
                                {row.original.paymentReference}
                            </span>
                        ),
                    header: 'Reference',
                },
            ),
        ],
        [allMutations, isLedgersPending, ledgerLabelById, ledgersErrorMessage],
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
            ) : isLoading || credentialId ? (
                isCollectionEmpty ? (
                    <EmptyState
                        description="Bookings posted to the accounting backend appear here."
                        icon={ListChecks}
                        title="No mutations yet"
                    />
                ) : (
                    <DataTable
                        columns={columns}
                        data={rows}
                        emptyState={
                            <EmptyState
                                description="No mutations match these filters."
                                icon={ListChecks}
                                title="No matches"
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
                                        label: mutationTypeLabel(code),
                                        value: code,
                                    }))}
                                    placeholder="All types"
                                    value={
                                        typeFilter === ALL
                                            ? undefined
                                            : typeFilter
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
                        isLoading={isLoading}
                        onResetFilters={reset}
                        rowId={(r) => r.externalId}
                        serverPagination={{
                            hasNextPage:
                                totalCount === undefined
                                    ? allMutations.length ===
                                      DATA_TABLE_PAGE_SIZE
                                    : offset + allMutations.length < totalCount,
                            isPending: mutationsQ.isPending,
                            onPageIndexChange: (pageIndex) =>
                                setOffset(pageIndex * DATA_TABLE_PAGE_SIZE),
                            pageIndex: offset / DATA_TABLE_PAGE_SIZE,
                            pageSize: DATA_TABLE_PAGE_SIZE,
                            totalCount:
                                typeFilter === ALL ? totalCount : undefined,
                        }}
                        showFilter
                    />
                )
            ) : (
                <NoConnectionState role={CredentialRole.Accounting} />
            )}
        </ToolPanel>
    );
}
