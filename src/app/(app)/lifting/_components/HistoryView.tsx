'use client';

import { endOfDay, format, startOfDay } from 'date-fns';
import { Calendar, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveColumnFilter,
} from '~/components/ui/DataTable';
import { DateRangePicker } from '~/components/ui/DatePicker';
import { EmptyState } from '~/components/ui/EmptyState';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/Tooltip';
import { DurationFormat } from '~/lib/lifting/format';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

interface HistoryViewProperties {
    from: Date;
}

type WorkoutRow = RouterOutputs['lifting']['workout']['list'][number];

const FILTER_ALL = '__all__';

const STATUS_OPTIONS = [
    { label: 'All', value: FILTER_ALL },
    { label: 'Completed', value: 'completed' },
    { label: 'In progress', value: 'in-progress' },
] as const;

const DURATION_OPTIONS = [
    { label: 'Any', value: FILTER_ALL },
    { label: '< 15 min', value: 'under-15' },
    { label: '15 – 60 min', value: '15-60' },
    { label: '1 – 2 h', value: '60-120' },
    { label: '> 2 h', value: 'over-120' },
] as const;

type DurationFilter = (typeof DURATION_OPTIONS)[number]['value'];
type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];

const DURATION_RANGES: Record<
    Exclude<DurationFilter, typeof FILTER_ALL>,
    [number, number]
> = {
    '15-60': [15 * 60, 60 * 60 - 1],
    '60-120': [60 * 60, 120 * 60 - 1],
    'over-120': [120 * 60, Infinity],
    'under-15': [0, 15 * 60 - 1],
};

const DURATION_RANGE_ENTRIES = Object.entries(DURATION_RANGES) as [
    Exclude<DurationFilter, typeof FILTER_ALL>,
    [number, number],
][];

export function HistoryView({ from }: HistoryViewProperties) {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const queryFrom = dateRange?.from ? startOfDay(dateRange.from) : from;
    const queryTo = dateRange?.to ? endOfDay(dateRange.to) : undefined;

    const utilities = api.useUtils();
    const workouts = api.lifting.workout.list.useQuery({
        from: queryFrom,
        limit: 200,
        offset: 0,
        to: queryTo,
    });
    const remove = api.lifting.workout.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Workout deleted');
            await utilities.lifting.workout.list.invalidate();
        },
    });

    const allRows = useMemo(() => workouts.data ?? [], [workouts.data]);

    const columns = useMemo<DataTableColumn<WorkoutRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <Link
                        className="font-medium text-white hover:underline"
                        href={routes.lifting.workout(row.original.id)}
                    >
                        {row.original.name ?? 'Workout'}
                    </Link>
                ),
                header: 'Workout',
            },
            {
                accessorFn: (r) => new Date(r.startedAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-muted-foreground tabular-nums">
                        {format(new Date(row.original.startedAt), 'EEE MMM d')}
                    </span>
                ),
                header: 'Date',
                id: 'date',
            },
            {
                accessorFn: (r) =>
                    new Date(r.startedAt).getHours() * 60 +
                    new Date(r.startedAt).getMinutes(),
                cell: ({ row }) => (
                    <span className="text-muted-foreground tabular-nums">
                        {format(new Date(row.original.startedAt), 'HH:mm')}
                    </span>
                ),
                header: 'Start',
                id: 'start',
            },
            {
                accessorFn: (r) => durationSeconds(r) ?? -1,
                cell: ({ row }) => {
                    const dur = durationSeconds(row.original);
                    return (
                        <span className="text-muted-foreground tabular-nums">
                            {dur === null ? '—' : DurationFormat.seconds(dur)}
                        </span>
                    );
                },
                filterFn: DataTableFilterFunction.InNumberRange,
                header: 'Duration',
                id: 'duration',
                meta: { align: DataTableAlign.End },
            },
            {
                accessorFn: (r) => (r.endedAt ? 'completed' : 'in-progress'),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Status',
                id: 'status',
            },
            {
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <AlertDialog>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            aria-label={`Delete ${row.original.name ?? 'workout'}`}
                                            className="size-8 p-0 text-muted-foreground hover:text-destructive"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Delete workout</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Delete workout?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        &ldquo;
                                        {row.original.name ?? 'Workout'}&rdquo;
                                        and all its sets will be permanently
                                        removed. This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        disabled={remove.isPending}
                                        onClick={() =>
                                            remove.mutate({
                                                id: row.original.id,
                                            })
                                        }
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                ),
                enableSorting: false,
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
            },
        ],
        [remove],
    );

    if (!dateRange && !workouts.isLoading && allRows.length === 0) {
        return (
            <Card>
                <CardContent>
                    <EmptyState
                        description="Start a workout from the Log tab and it'll show up here."
                        icon={Calendar}
                        title="No workouts yet"
                    />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Workouts
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Date range</Label>
                        <DateRangePicker
                            maxDate={new Date()}
                            onChange={setDateRange}
                            placeholder="Any time"
                            value={dateRange}
                        />
                    </div>
                </div>

                <DataTable
                    columns={columns}
                    data={allRows}
                    emptyState={
                        <EmptyState
                            description="Try widening the filters or logging a workout."
                            icon={Calendar}
                            title="No workouts match"
                        />
                    }
                    headerActions={(table) => {
                        const statusColumn = table.getColumn('status');
                        const durationColumn = table.getColumn('duration');
                        return (
                            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-end">
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                        Status
                                    </span>
                                    <Select
                                        onValueChange={(v) =>
                                            statusColumn?.setFilterValue(
                                                v === FILTER_ALL
                                                    ? undefined
                                                    : v,
                                            )
                                        }
                                        value={
                                            (statusColumn?.getFilterValue() as
                                                StatusFilter | undefined) ??
                                            FILTER_ALL
                                        }
                                    >
                                        <SelectTrigger className="h-8 w-36 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_OPTIONS.map((o) => (
                                                <SelectItem
                                                    key={o.value}
                                                    value={o.value}
                                                >
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                        Duration
                                    </span>
                                    <Select
                                        onValueChange={(v) =>
                                            durationColumn?.setFilterValue(
                                                v === FILTER_ALL
                                                    ? undefined
                                                    : DURATION_RANGES[
                                                          v as Exclude<
                                                              DurationFilter,
                                                              typeof FILTER_ALL
                                                          >
                                                      ],
                                            )
                                        }
                                        value={durationBucketOf(
                                            durationColumn?.getFilterValue(),
                                        )}
                                    >
                                        <SelectTrigger className="h-8 w-36 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DURATION_OPTIONS.map((o) => (
                                                <SelectItem
                                                    key={o.value}
                                                    value={o.value}
                                                >
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <ClearFiltersButton
                                    active={hasActiveColumnFilter(table)}
                                    onReset={() => table.resetColumnFilters()}
                                />
                            </div>
                        );
                    }}
                    isLoading={workouts.isLoading}
                    pageSize={20}
                    rowId={(r) => r.id}
                    showFilter
                />
            </CardContent>
        </Card>
    );
}

function durationBucketOf(filterValue: unknown): DurationFilter {
    if (!Array.isArray(filterValue)) return FILTER_ALL;
    const [min, max] = filterValue as [number, number];
    const match = DURATION_RANGE_ENTRIES.find(
        ([, range]) => range[0] === min && range[1] === max,
    );
    return match ? match[0] : FILTER_ALL;
}

function durationSeconds(w: WorkoutRow): null | number {
    if (!w.endedAt) return null;
    return Math.round(
        (new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) /
            1000,
    );
}
