'use client';

import { ChevronRight, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '~/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/DataTable';
import { DataTableFacetSelect } from '~/components/ui/DataTableFacetSelect';
import { EmptyState } from '~/components/ui/EmptyState';
import { FilterToggle } from '~/components/ui/FilterToggle';
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
                        <Badge variant="secondary">Custom</Badge>
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
            },
        ],
        [],
    );

    return (
        <div className="flex flex-col gap-6">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatCard label="Total" value={stats.total.toString()} />
                <StatCard label="Custom" value={stats.custom.toString()} />
                <StatCard label="Built-in" value={stats.builtin.toString()} />
            </section>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        Library
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <DataTable<ExerciseRow>
                        columns={columns}
                        data={allRows}
                        emptyState={
                            <EmptyState
                                description="Try a different search or clear the filters."
                                icon={Dumbbell}
                                title="No exercises match"
                            />
                        }
                        filterPlaceholder="Search exercises"
                        headerActions={(table) => {
                            const sourceColumn = table.getColumn('source');
                            return (
                                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                                    <DataTableFacetSelect
                                        column={table.getColumn(
                                            'primaryMuscle',
                                        )}
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
                        pageSize={25}
                        rowId={(r) => r.id}
                        search={{ onChange: setSearch, value: search }}
                        showFilter
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <Card className="gap-1 py-3">
            <CardContent className="flex flex-col gap-1 px-3">
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    {label}
                </span>
                <span className="font-mono text-lg leading-none font-bold text-foreground tabular-nums">
                    {value}
                </span>
            </CardContent>
        </Card>
    );
}
