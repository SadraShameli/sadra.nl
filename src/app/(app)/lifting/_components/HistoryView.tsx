'use client';

import { endOfDay, startOfDay } from 'date-fns';
import { Calendar, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { toast } from 'sonner';

import {
    deleteRowAction,
    linkRowAction,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/data-table';
import { EmptyState, EmptyStatePanel } from '~/components/ui/empty-state';
import { FilterDateRange } from '~/components/ui/filter-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import { formatDisplayDateTime } from '~/lib/format';
import { DurationFormat } from '~/lib/lifting/format';
import {
    WORKOUT_DURATION_BUCKETS,
    WorkoutDuration,
} from '~/lib/lifting/workout-duration';
import { workoutName } from '~/lib/lifting/workout-name';
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
                        {workoutName(row.original)}
                    </Link>
                ),
                header: 'Workout',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (r) => new Date(r.startedAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-muted-foreground tabular-nums">
                        {formatDisplayDateTime(row.original.startedAt)}
                    </span>
                ),
                header: 'Date',
                id: 'date',
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
            rowActionsColumn<WorkoutRow>({
                actionsOf: (workout) => [
                    linkRowAction({
                        href: routes.lifting.workout(workout.id),
                        icon: ExternalLink,
                        label: 'Open',
                    }),
                    deleteRowAction({
                        description: `“${workoutName(workout)}” and all its sets will be permanently removed. This cannot be undone.`,
                        onDelete: () => remove.mutate({ id: workout.id }),
                        title: 'Delete workout?',
                    }),
                ],
                isPendingOf: (workout) =>
                    remove.isPending && remove.variables.id === workout.id,
                labelOf: workoutName,
            }),
        ],
        [remove],
    );

    return !dateRange && !workouts.isLoading && allRows.length === 0 ? (
        <EmptyStatePanel
            description="Start a workout from the Log tab and it'll show up here."
            icon={Calendar}
            title="No workouts yet"
        />
    ) : (
        <ToolPanel contentClassName="flex flex-col gap-4" title="Workouts">
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
                        <div className="flex flex-wrap items-center gap-2">
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
        </ToolPanel>
    );
}
