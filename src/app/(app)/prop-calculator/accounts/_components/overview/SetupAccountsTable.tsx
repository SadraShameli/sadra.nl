'use client';

import Link from 'next/link';

import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/DataTable';
import { DataTableFacetSelect } from '~/components/ui/DataTableFacetSelect';
import { NOT_APPLICABLE } from '~/lib/format';

import { type SetupAccountRow } from './overviewModel';

const SETUP_ACCOUNTS_PAGE_SIZE = 10;

enum SetupAccountColumn {
    Account = 'account',
    Firm = 'firm',
    Note = 'note',
    Plan = 'plan',
    Purchased = 'purchased',
    Stage = 'stage',
}

const SETUP_ACCOUNT_COLUMNS: DataTableColumn<SetupAccountRow>[] = [
    {
        accessorFn: (row) => row.label,
        cell: ({ row }) => (
            <Link
                className="font-medium underline-offset-4 hover:underline"
                href={row.original.href}
            >
                {row.original.label}
            </Link>
        ),
        header: 'Account',
        id: SetupAccountColumn.Account,
    },
    {
        accessorFn: (row) => row.firm,
        filterFn: DataTableFilterFunction.Equals,
        header: 'Firm',
        id: SetupAccountColumn.Firm,
    },
    {
        accessorFn: (row) => row.plan ?? NOT_APPLICABLE,
        filterFn: DataTableFilterFunction.Equals,
        header: 'Plan',
        id: SetupAccountColumn.Plan,
    },
    {
        accessorFn: (row) => row.stage,
        filterFn: DataTableFilterFunction.Equals,
        header: 'Stage',
        id: SetupAccountColumn.Stage,
    },
    {
        accessorFn: (row) => row.purchasedOn,
        cell: ({ row }) => (
            <span className="tabular-nums">{row.original.purchasedOn}</span>
        ),
        header: 'Purchased',
        id: SetupAccountColumn.Purchased,
    },
    {
        accessorFn: (row) => row.note ?? '',
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {row.original.note}
            </span>
        ),
        header: 'Balance',
        id: SetupAccountColumn.Note,
    },
];

export function SetupAccountsTable({
    accounts,
}: {
    readonly accounts: readonly SetupAccountRow[];
}) {
    return (
        <DataTable<SetupAccountRow>
            columns={SETUP_ACCOUNT_COLUMNS}
            data={[...accounts]}
            filterPlaceholder="Search accounts"
            headerActions={(table) => (
                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                    <DataTableFacetSelect
                        column={table.getColumn(SetupAccountColumn.Firm)}
                        placeholder="All firms"
                    />
                    <DataTableFacetSelect
                        column={table.getColumn(SetupAccountColumn.Plan)}
                        placeholder="All plans"
                    />
                    <DataTableFacetSelect
                        column={table.getColumn(SetupAccountColumn.Stage)}
                        placeholder="All stages"
                    />
                </div>
            )}
            initialColumnVisibility={{
                [SetupAccountColumn.Note]: accounts.some(
                    (account) => account.note !== null,
                ),
            }}
            initialSorting={[{ desc: false, id: SetupAccountColumn.Account }]}
            pageSize={SETUP_ACCOUNTS_PAGE_SIZE}
            rowId={(row) => row.key}
            showFilter
        />
    );
}
