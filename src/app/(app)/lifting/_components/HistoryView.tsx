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
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import { FilterDateRange } from '~/components/ui/FilterDateRange';
import { FilterSelect } from '~/components/ui/FilterSelect';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/Tooltip';
import { DurationFormat } from '~/lib/lifting/format';
import {
    WORKOUT_DURATION_BUCKETS,
    WorkoutDuration,
} from '~/lib/lifting/workout-duration';
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

type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];

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
                        className="font-medium text-foreground hover:underline"
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
                accessorFn: (r) => WorkoutDuration.seconds(r) ?? -1,
                cell: ({ row }) => {
                    const dur = WorkoutDuration.seconds(row.original);
                    return (
                        <span className="text-muted-foreground tabular-nums">
                            {dur === null ? '-' : DurationFormat.seconds(dur)}
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

    return !dateRange && !workouts.isLoading && allRows.length === 0 ? (
        <Card>
            <CardContent>
                <EmptyState
                    description="Start a workout from the Log tab and it'll show up here."
                    icon={Calendar}
                    title="No workouts yet"
                />
            </CardContent>
        </Card>
    ) : (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Workouts
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
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
                    hasExternalFilters={Boolean(dateRange?.from)}
                    headerActions={(table) => {
                        const statusColumn = table.getColumn('status');
                        const durationColumn = table.getColumn('duration');
                        return (
                            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                                <FilterSelect
                                    label="Status"
                                    onValueChange={(v) =>
                                        statusColumn?.setFilterValue(v)
                                    }
                                    options={STATUS_OPTIONS.filter(
                                        (o) => o.value !== FILTER_ALL,
                                    )}
                                    placeholder="All statuses"
                                    value={
                                        statusColumn?.getFilterValue() as
                                            StatusFilter | undefined
                                    }
                                />
                                <FilterSelect
                                    label="Duration"
                                    onValueChange={(v) =>
                                        durationColumn?.setFilterValue(
                                            WorkoutDuration.bucketForValue(v)
                                                ?.range,
                                        )
                                    }
                                    options={WORKOUT_DURATION_BUCKETS}
                                    placeholder="Any duration"
                                    value={
                                        WorkoutDuration.bucketForFilterValue(
                                            durationColumn?.getFilterValue(),
                                        )?.value
                                    }
                                />
                                <FilterDateRange
                                    label="Workout date"
                                    maxDate={new Date()}
                                    onChange={setDateRange}
                                    placeholder="Any time"
                                    value={dateRange}
                                />
                            </div>
                        );
                    }}
                    isLoading={workouts.isLoading}
                    onResetFilters={() => setDateRange(undefined)}
                    pageSize={20}
                    rowId={(r) => r.id}
                    showFilter
                />
            </CardContent>
        </Card>
    );
}
