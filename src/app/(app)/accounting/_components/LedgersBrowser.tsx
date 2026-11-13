'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { useMemo } from 'react';
import { z } from 'zod';

import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { EmptyState } from '~/components/ui/empty-state';
import { CredentialRole } from '~/lib/accounting/credentials/index';
import {
    LEDGER_CATEGORY_LABEL,
    LedgerCategory,
} from '~/lib/accounting/providers/eboekhouden/enums';
import { type RouterOutputs, useTRPC } from '~/trpc/react';

import { ActiveConnectionNote } from './ActiveConnectionNote';
import { NoConnectionState } from './NoConnectionState';
import { columnWhenAnyRow } from './tableColumns';
import { useActiveCredentials } from './useActiveCredentials';

const ledgerCategoryLabel = (category: string): string => {
    const known = z.enum(LedgerCategory).safeParse(category);
    return known.success ? LEDGER_CATEGORY_LABEL[known.data] : category;
};

export function LedgersBrowser() {
    type Ledger = RouterOutputs['accounting']['ledgers']['list'][number];
    const api = useTRPC();
    const { accounting, isLoading: isCredentialsLoading } =
        useActiveCredentials();
    const credentialId = accounting?.id ?? '';

    const ledgersQ = useQuery(
        api.accounting.ledgers.list.queryOptions(
            { credentialId },
            { enabled: !!credentialId },
        ),
    );
    const allLedgers = useMemo(() => ledgersQ.data ?? [], [ledgersQ.data]);
    const isLoading =
        isCredentialsLoading || (!!credentialId && ledgersQ.isPending);

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
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'category',
                cell: ({ row }) => (
                    <Badge>{ledgerCategoryLabel(row.original.category)}</Badge>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Category',
            },
            ...columnWhenAnyRow<Ledger>(
                allLedgers,
                (ledger) => ledger.group !== null,
                {
                    accessorKey: 'group',
                    cell: ({ row }) => (
                        <span className="text-xs text-muted-foreground">
                            {row.original.group}
                        </span>
                    ),
                    header: 'Group',
                },
            ),
        ],
        [allLedgers],
    );

    return (
        <ToolPanel
            description={
                <ActiveConnectionNote
                    credential={accounting}
                    role={CredentialRole.Accounting}
                />
            }
            title="Ledger accounts"
        >
            {ledgersQ.error ? (
                <EmptyState
                    description={ledgersQ.error.message}
                    title="Could not fetch ledgers"
                />
            ) : isLoading || credentialId ? (
                !isLoading && allLedgers.length === 0 ? (
                    <EmptyState
                        description="The accounting backend holds no ledger accounts yet."
                        icon={BookOpen}
                        title="No ledgers"
                    />
                ) : (
                    <DataTable
                        columns={columns}
                        data={allLedgers}
                        emptyState={
                            <EmptyState
                                description="No ledgers match these filters."
                                icon={BookOpen}
                                title="No matches"
                            />
                        }
                        filterPlaceholder="Search ledgers…"
                        headerActions={(table) => (
                            <div className="flex flex-wrap items-center gap-2">
                                <DataTableFacetSelect
                                    column={table.getColumn('category')}
                                    format={ledgerCategoryLabel}
                                    placeholder="All categories"
                                />
                            </div>
                        )}
                        isLoading={isLoading}
                        rowId={(r) => r.externalId}
                        showFilter
                    />
                )
            ) : (
                <NoConnectionState role={CredentialRole.Accounting} />
            )}
        </ToolPanel>
    );
}
