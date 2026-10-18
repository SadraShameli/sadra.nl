'use client';

import { ChevronRight, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { NoMatchesState } from '~/components/ui/empty-state';
import { FilterToggle } from '~/components/ui/filter-toggle';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type ExerciseRow = RouterOutputs['lifting']['exercise']['list'][number];

export function ExercisesBrowser() {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search), 250);
        return () => clearTimeout(id);
    }, [search]);

    const exercises = api.lifting.exercise.list.useQuery({
        includeCustom: true,
        limit: 200,
        offset: 0,
        search: debouncedSearch,
    });

    const allRows = useMemo(() => exercises.data ?? [], [exercises.data]);

    const stats = useMemo(() => {
        const custom = allRows.filter((row) => row.isCustom).length;
        return {
            builtin: allRows.length - custom,
            custom,
            total: allRows.length,
        };
    }, [allRows]);

    const columns = useMemo<DataTableColumn<ExerciseRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <Link
                        className="font-medium text-foreground hover:underline"
                        href={routes.lifting.exercise(row.original.slug)}
                    >
                        {row.original.name}
                    </Link>
                ),
                header: 'Name',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: 'primaryMuscle',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground capitalize">
                        {row.original.primaryMuscle}
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Muscle',
            },
            {
                accessorKey: 'equipment',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground capitalize">
                        {row.original.equipment}
                    </span>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Equipment',
            },
            {
                accessorFn: (r) => (r.isCustom ? 1 : 0),
                cell: ({ row }) =>
                    row.original.isCustom ? (
                        <Badge>Custom</Badge>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            Built-in
                        </span>
                    ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Source',
                id: 'source',
            },
            {
                cell: ({ row }) => (
                    <Link
                        aria-label={`Open ${row.original.name}`}
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        href={routes.lifting.exercise(row.original.slug)}
                    >
                        <ChevronRight className="size-4" />
                    </Link>
                ),
                enableSorting: false,
                header: () => <span className="sr-only">Open</span>,
                id: 'open',
                meta: { isHiddenInCards: true },
            },
        ],
        [],
    );

    return (
        <div className="flex flex-col gap-6">
            <StatStrip
                isLoading={exercises.isLoading}
                items={[
                    {
                        id: 'total',
                        label: 'Total',
                        value: stats.total.toString(),
                    },
                    {
                        id: 'custom',
                        label: 'Custom',
                        value: stats.custom.toString(),
                    },
                    {
                        id: 'built-in',
                        label: 'Built-in',
                        value: stats.builtin.toString(),
                    },
                ]}
            />

            <ToolPanel contentClassName="flex flex-col gap-4" title="Library">
                <DataTable<ExerciseRow>
                    columns={columns}
                    data={allRows}
                    emptyState={
                        <NoMatchesState icon={Dumbbell} noun="exercises" />
                    }
                    filterPlaceholder="Search exercises"
                    headerActions={(table) => {
                        const sourceColumn = table.getColumn('source');
                        return (
                            <div className="flex flex-wrap items-center gap-2">
                                <DataTableFacetSelect
                                    column={table.getColumn('primaryMuscle')}
                                    label="Muscle"
                                    placeholder="All muscles"
                                />
                                <DataTableFacetSelect
                                    column={table.getColumn('equipment')}
                                    label="Equipment"
                                    placeholder="All gear"
                                />
                                <FilterToggle
                                    isPressed={
                                        sourceColumn?.getFilterValue() === 1
                                    }
                                    label="Custom only"
                                    onPressedChange={(pressed) =>
                                        sourceColumn?.setFilterValue(
                                            pressed ? 1 : undefined,
                                        )
                                    }
                                />
                            </div>
                        );
                    }}
                    isLoading={exercises.isLoading}
                    rowId={(r) => r.id}
                    search={{ onChange: setSearch, value: search }}
                    showFilter
                />
            </ToolPanel>
        </div>
    );
}
