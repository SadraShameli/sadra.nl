'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ChevronRight, Dumbbell, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge } from '~/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Checkbox } from '~/components/ui/Checkbox';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import {
    type Equipment,
    EQUIPMENT_VALUES,
    MUSCLE_VALUES,
    type MuscleGroup,
} from '~/lib/lifting/types';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type ExerciseRow = RouterOutputs['lifting']['exercise']['list'][number];

const FILTER_ALL = '__all__';

export function ExercisesBrowser() {
    const [search, setSearch] = useState('');
    const [muscle, setMuscle] = useState<string>(FILTER_ALL);
    const [equipment, setEquipment] = useState<string>(FILTER_ALL);
    const [customOnly, setCustomOnly] = useState(false);

    const exercises = api.lifting.exercise.list.useQuery({
        equipment:
            equipment === FILTER_ALL ? undefined : (equipment as Equipment),
        includeCustom: true,
        limit: 200,
        muscle: muscle === FILTER_ALL ? undefined : (muscle as MuscleGroup),
        offset: 0,
        search,
    });

    const allRows = useMemo(() => exercises.data ?? [], [exercises.data]);
    const rows = useMemo(
        () => (customOnly ? allRows.filter((e) => e.isCustom) : allRows),
        [allRows, customOnly],
    );

    const stats = useMemo(() => {
        const custom = allRows.filter((e) => e.isCustom).length;
        return {
            builtin: allRows.length - custom,
            custom,
            total: allRows.length,
        };
    }, [allRows]);

    const hasFilters =
        search !== '' ||
        muscle !== FILTER_ALL ||
        equipment !== FILTER_ALL ||
        customOnly;

    const reset = () => {
        setSearch('');
        setMuscle(FILTER_ALL);
        setEquipment(FILTER_ALL);
        setCustomOnly(false);
    };

    const columns = useMemo<ColumnDef<ExerciseRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <Link
                        className="font-medium text-white hover:underline"
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
                header: 'Muscle',
            },
            {
                accessorKey: 'equipment',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground capitalize">
                        {row.original.equipment}
                    </span>
                ),
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
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Search</Label>
                            <div className="relative">
                                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    className="pl-9"
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search exercises…"
                                    value={search}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Muscle</Label>
                            <Select onValueChange={setMuscle} value={muscle}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>
                                        All muscles
                                    </SelectItem>
                                    {MUSCLE_VALUES.map((m) => (
                                        <SelectItem key={m} value={m}>
                                            <span className="capitalize">
                                                {m}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Equipment</Label>
                            <Select
                                onValueChange={setEquipment}
                                value={equipment}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>
                                        All gear
                                    </SelectItem>
                                    {EQUIPMENT_VALUES.map((eq) => (
                                        <SelectItem key={eq} value={eq}>
                                            <span className="capitalize">
                                                {eq}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <label
                            className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 text-xs whitespace-nowrap"
                            htmlFor="exercises-custom-only"
                        >
                            <Checkbox
                                checked={customOnly}
                                id="exercises-custom-only"
                                onCheckedChange={(v) =>
                                    setCustomOnly(v === true)
                                }
                            />
                            Custom only
                        </label>
                    </div>
                    <ClearFiltersButton active={hasFilters} onReset={reset} />

                    <DataTable<ExerciseRow, unknown>
                        columns={columns}
                        data={rows}
                        emptyState={
                            <EmptyState
                                description="Try a different search or clear the filters."
                                icon={Dumbbell}
                                title="No exercises match"
                            />
                        }
                        isLoading={exercises.isLoading}
                        pageSize={25}
                        rowId={(r) => r.id}
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
