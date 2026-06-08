'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';

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
import { MUTATION_TYPES } from '~/lib/accounting/providers/eboekhouden/enums';
import { api } from '~/trpc/react';

import { ProviderCredentialPicker } from './ProviderCredentialPicker';

const ALL = '__all__';
const FETCH_LIMIT = 100;

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

export function MutationsBrowser() {
    const [credentialId, setCredentialId] = useState<string>('');
    const [typeFilter, setTypeFilter] = useState<string>(ALL);

    const mutationsQ = api.accounting.mutations.list.useQuery(
        { credentialId, limit: FETCH_LIMIT },
        { enabled: !!credentialId },
    );

    const rows = useMemo(() => {
        const all = mutationsQ.data ?? [];
        if (typeFilter === ALL) return all;
        return all.filter((m) => m.type === typeFilter);
    }, [mutationsQ.data, typeFilter]);

    const hasFilters = typeFilter !== ALL;
    const reset = () => setTypeFilter(ALL);

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

    return (
        <Card>
            <CardContent>
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
                        headerActions={
                            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                                <ClearFiltersButton
                                    active={hasFilters}
                                    className="hidden md:flex"
                                    onReset={reset}
                                />
                                <ProviderCredentialPicker
                                    credentialRole="accounting"
                                    inline
                                    onChange={setCredentialId}
                                    value={credentialId}
                                />
                                <Select
                                    onValueChange={setTypeFilter}
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
                                            Object.entries(MUTATION_TYPES) as [
                                                keyof typeof MUTATION_TYPES,
                                                string,
                                            ][]
                                        ).map(([name, code]) => (
                                            <SelectItem key={code} value={code}>
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
                )}
            </CardContent>
        </Card>
    );
}
