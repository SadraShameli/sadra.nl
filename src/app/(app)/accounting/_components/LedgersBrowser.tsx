'use client';

import { BookOpen } from 'lucide-react';
import { useMemo } from 'react';

import type { LedgerId } from '~/lib/accounting/core/ids';

import { Badge } from '~/components/ui/Badge';
import { Card, CardContent } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    type DataTableInstance,
} from '~/components/ui/DataTable';
import { DataTableFacetSelect } from '~/components/ui/DataTableFacetSelect';
import { EmptyState } from '~/components/ui/EmptyState';
import { LedgerCategory } from '~/lib/accounting/providers/eboekhouden/enums';
import { api } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { useActiveCredentials } from './useActiveCredentials';

type Ledger = {
    category: string;
    code: string;
    description: string;
    externalId: LedgerId;
    group: null | string;
};

function hasActiveFilter(table: DataTableInstance<Ledger>): boolean {
    return table.getColumn('category')?.getFilterValue() !== undefined;
}

const LEDGER_CATEGORY_LABEL: Record<LedgerCategory, string> = {
    [LedgerCategory.Af]: 'Depreciation',
    [LedgerCategory.Af6]: 'Depreciation 6%',
    [LedgerCategory.Af19]: 'Depreciation 19%',
    [LedgerCategory.AfOverig]: 'Depreciation other',
    [LedgerCategory.Bal]: 'Balance sheet',
    [LedgerCategory.Btwrc]: 'VAT current account',
    [LedgerCategory.Cred]: 'Payables (creditors)',
    [LedgerCategory.Deb]: 'Receivables (debtors)',
    [LedgerCategory.Fin]: 'Financial',
    [LedgerCategory.Voor]: 'Inventory',
    [LedgerCategory.Vw]: 'Profit & loss',
};

export function LedgersBrowser() {
    const { accounting } = useActiveCredentials();
    const credentialId = accounting?.id ?? '';

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );
    const allLedgers = useMemo(() => ledgersQ.data ?? [], [ledgersQ.data]);

    const columns = useMemo<DataTableColumn<Ledger>[]>(
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
                accessorKey: 'code',
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold">
                        {row.original.code}
                    </span>
                ),
                header: 'Code',
            },
            {
                accessorKey: 'description',
                header: 'Description',
            },
            {
                accessorKey: 'category',
                cell: ({ row }) => (
                    <Badge variant="outline">
                        {(LEDGER_CATEGORY_LABEL as Record<string, string>)[
                            row.original.category
                        ] ?? row.original.category}
                    </Badge>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Category',
            },
            {
                accessorKey: 'group',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {row.original.group ?? '—'}
                    </span>
                ),
                header: 'Group',
            },
        ],
        [],
    );

    return (
        <Card>
            <CardContent>
                {ledgersQ.error ? (
                    <EmptyState
                        description={ledgersQ.error.message}
                        title="Could not fetch ledgers"
                    />
                ) : (
                    <DataTable
                        columns={columns}
                        data={allLedgers}
                        emptyState={(table) => (
                            <EmptyState
                                description={
                                    credentialId
                                        ? hasActiveFilter(table)
                                            ? 'No ledgers match this filter.'
                                            : 'Try a different category or pick another credential.'
                                        : 'Pick an accounting credential to load its ledgers.'
                                }
                                icon={BookOpen}
                                title={
                                    credentialId
                                        ? 'No ledgers'
                                        : 'No credential selected'
                                }
                            />
                        )}
                        filterPlaceholder="Search ledgers…"
                        headerActions={(table) => (
                            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                                <ClearFiltersButton
                                    active={hasActiveFilter(table)}
                                    className="hidden md:flex"
                                    onReset={() => table.resetColumnFilters()}
                                />
                                <ActiveConnectionNote
                                    credential={accounting}
                                    roleNoun="accounting credential"
                                />
                                <DataTableFacetSelect
                                    className="w-48"
                                    column={table.getColumn('category')}
                                    format={(value) =>
                                        (
                                            LEDGER_CATEGORY_LABEL as Record<
                                                string,
                                                string
                                            >
                                        )[value] ?? value
                                    }
                                    placeholder="All categories"
                                />
                                <ClearFiltersButton
                                    active={hasActiveFilter(table)}
                                    className="md:hidden"
                                    onReset={() => table.resetColumnFilters()}
                                />
                            </div>
                        )}
                        isLoading={!!credentialId && ledgersQ.isPending}
                        pageSize={25}
                        rowId={(r) => r.externalId}
                        showFilter
                    />
                )}
            </CardContent>
        </Card>
    );
}
