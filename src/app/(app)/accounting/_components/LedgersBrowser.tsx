'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { BookOpen } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { LedgerId } from '~/lib/accounting/core/ids';

import { Badge } from '~/components/ui/Badge';
import { Card, CardContent } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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

const ALL = '__all__';

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
    const [category, setCategory] = useState<string>(ALL);

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );
    const allLedgers = useMemo(() => ledgersQ.data ?? [], [ledgersQ.data]);
    const categoryOptions = useMemo(
        () =>
            [...new Set(allLedgers.map((l) => l.category))].toSorted((a, b) =>
                a.localeCompare(b),
            ),
        [allLedgers],
    );
    const filtered = useMemo(
        () =>
            category === ALL
                ? allLedgers
                : allLedgers.filter((l) => l.category === category),
        [allLedgers, category],
    );

    const hasFilters = category !== ALL;
    const reset = () => setCategory(ALL);

    const columns = useMemo<ColumnDef<Ledger>[]>(
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
                        data={filtered}
                        emptyState={
                            <EmptyState
                                description={
                                    credentialId
                                        ? hasFilters
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
                        }
                        filterPlaceholder="Search ledgers…"
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
                                <Select
                                    onValueChange={setCategory}
                                    value={category}
                                >
                                    <SelectTrigger className="h-8 w-48 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>
                                            All categories
                                        </SelectItem>
                                        {categoryOptions.map((c) => (
                                            <SelectItem key={c} value={c}>
                                                {(
                                                    LEDGER_CATEGORY_LABEL as Record<
                                                        string,
                                                        string
                                                    >
                                                )[c] ?? c}
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
