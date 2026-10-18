'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
    BookmarkPlus,
    Calendar,
    Clock,
    Flame,
    Layers,
    Trash2,
    Trophy,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import { RoutineDraft } from '~/app/(app)/lifting/_components/RoutineDraft';
import { FormDialog } from '~/components/FormDialog';
import { FormTextField } from '~/components/FormFields';
import { MissingValue } from '~/components/MissingValue';
import { PageHeader } from '~/components/PageHeader';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { Dialog, DialogTrigger } from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { SEARCH_FIELD_CLASS } from '~/components/ui/filter-control';
import { FilterSelect } from '~/components/ui/filter-select';
import { FilterToggle } from '~/components/ui/filter-toggle';
import { Input } from '~/components/ui/input';
import { formatDisplayDateTime } from '~/lib/format';
import { DistanceUnit, DurationFormat, WeightUnit } from '~/lib/lifting/format';
import { routineInputSchema } from '~/lib/lifting/schemas';
import { workoutName } from '~/lib/lifting/workout-name';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type SetRow = WorkoutDetail['exercises'][number]['sets'][number];
type WorkoutDetail = RouterOutputs['lifting']['workout']['get'];
interface WorkoutDetailViewProperties {
    initial: WorkoutDetail;
}

type WorkoutExercise = WorkoutDetail['exercises'][number];

const FILTER_ALL = '__all__';

const SetColumn = {
    Distance: 'distanceM',
    Duration: 'durationS',
    Reps: 'reps',
    Rir: 'rir',
    Rpe: 'rpe',
    Tempo: 'tempo',
    Weight: 'weightKg',
} as const;

type SetColumn = (typeof SetColumn)[keyof typeof SetColumn];

const OPTIONAL_SET_COLUMNS: readonly SetColumn[] = Object.values(SetColumn);

const SET_COLUMN_VALUE: Readonly<
    Record<SetColumn, (set: SetRow) => null | number | string>
> = {
    [SetColumn.Distance]: (set) => set.distanceM,
    [SetColumn.Duration]: (set) => set.durationS,
    [SetColumn.Reps]: (set) => set.reps,
    [SetColumn.Rir]: (set) => set.rir,
    [SetColumn.Rpe]: (set) => set.rpe,
    [SetColumn.Tempo]: (set) => set.tempo,
    [SetColumn.Weight]: (set) => set.weightKg,
};

const routineNameSchema = routineInputSchema.pick({ name: true });

type RoutineNameValues = z.infer<typeof routineNameSchema>;

export function WorkoutDetailView({ initial }: WorkoutDetailViewProperties) {
    const router = useRouter();
    const utilities = api.useUtils();
    const workout = api.lifting.workout.get.useQuery(
        { id: initial.id },
        { initialData: initial },
    );
    const remove = api.lifting.workout.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Workout deleted');
            await utilities.lifting.workout.list.invalidate();
            router.push(routes.lifting.history);
        },
    });
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';
    const unitDistance = settings.data?.unitDistance ?? 'm';

    const w = workout.data;
    const exercises = w.exercises;

    const [exerciseFilter, setExerciseFilter] = useState<string>(FILTER_ALL);
    const [search, setSearch] = useState('');
    const [prOnly, setPrOnly] = useState(false);

    const filteredExercises = useMemo<WorkoutExercise[]>(() => {
        const q = search.trim().toLowerCase();
        return exercises
            .filter((wex) => {
                return (
                    (exerciseFilter === FILTER_ALL ||
                        wex.id === exerciseFilter) &&
                    (!q || wex.exercise.name.toLowerCase().includes(q))
                );
            })
            .map((wex) =>
                prOnly ? { ...wex, sets: wex.sets.filter((s) => s.isPr) } : wex,
            )
            .filter((wex) => !prOnly || wex.sets.length > 0);
    }, [exercises, exerciseFilter, search, prOnly]);

    const stats = useMemo(() => {
        let totalSets = 0;
        let prs = 0;
        let volumeKg = 0;
        for (const wex of exercises) {
            for (const s of wex.sets) {
                totalSets += 1;
                if (s.isPr) prs += 1;
                if (s.weightKg !== null && s.reps !== null) {
                    volumeKg += s.weightKg * s.reps;
                }
            }
        }
        return {
            exerciseCount: exercises.length,
            prs,
            totalSets,
            volumeKg,
        };
    }, [exercises]);

    const hasFilters = exerciseFilter !== FILTER_ALL || search !== '' || prOnly;
    const reset = () => {
        setExerciseFilter(FILTER_ALL);
        setSearch('');
        setPrOnly(false);
    };

    const workoutSetColumns = useMemo<DataTableColumn<SetRow>[]>(
        () => [
            {
                accessorKey: 'order',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        Set {row.original.order}
                    </span>
                ),
                header: 'Set',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: SetColumn.Weight,
                cell: ({ row }) =>
                    row.original.weightKg === null ? (
                        <MissingValue />
                    ) : (
                        <span className="font-semibold tabular-nums">
                            {WeightUnit.format(
                                row.original.weightKg,
                                unitWeight,
                            )}
                        </span>
                    ),
                header: 'Weight',
            },
            {
                accessorKey: SetColumn.Reps,
                cell: ({ row }) =>
                    row.original.reps === null ? (
                        <MissingValue />
                    ) : (
                        <span className="font-semibold tabular-nums">
                            × {row.original.reps}
                        </span>
                    ),
                header: 'Reps',
            },
            {
                accessorKey: SetColumn.Rpe,
                cell: ({ row }) => <SetDetailCell value={row.original.rpe} />,
                header: 'RPE',
            },
            {
                accessorKey: SetColumn.Rir,
                cell: ({ row }) => <SetDetailCell value={row.original.rir} />,
                header: 'RIR',
            },
            {
                accessorKey: SetColumn.Tempo,
                cell: ({ row }) => <SetDetailCell value={row.original.tempo} />,
                enableSorting: false,
                header: 'Tempo',
            },
            {
                accessorKey: SetColumn.Distance,
                cell: ({ row }) => (
                    <SetDetailCell
                        value={
                            row.original.distanceM === null
                                ? null
                                : `${DistanceUnit.toDisplay(
                                      row.original.distanceM,
                                      unitDistance,
                                  ).toFixed(
                                      unitDistance === 'm' ? 0 : 2,
                                  )} ${unitDistance}`
                        }
                    />
                ),
                header: 'Distance',
            },
            {
                accessorKey: SetColumn.Duration,
                cell: ({ row }) => (
                    <SetDetailCell
                        value={
                            row.original.durationS === null
                                ? null
                                : DurationFormat.seconds(row.original.durationS)
                        }
                    />
                ),
                header: 'Duration',
            },
            {
                cell: ({ row }) =>
                    row.original.isPr ? (
                        <Badge className="gap-1">
                            <Trophy className="size-3" /> PR
                        </Badge>
                    ) : null,
                enableSorting: false,
                header: '',
                id: 'pr',
            },
        ],
        [unitWeight, unitDistance],
    );
    const durationSeconds = w.endedAt
        ? Math.round(
              (new Date(w.endedAt).getTime() -
                  new Date(w.startedAt).getTime()) /
                  1000,
          )
        : null;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
                <PageHeader
                    actions={
                        <>
                            <SaveAsRoutineButton workout={w} />
                            <ConfirmDialog
                                confirmLabel="Delete"
                                description={
                                    <>
                                        &ldquo;{workoutName(w)}&rdquo; and all
                                        its sets will be permanently removed.
                                        This cannot be undone.
                                    </>
                                }
                                isPending={remove.isPending}
                                onConfirm={() => remove.mutate({ id: w.id })}
                                title="Delete workout?"
                            >
                                <Button
                                    aria-label="Delete workout"
                                    className="shrink-0 gap-2 text-muted-foreground hover:text-destructive"
                                    type="button"
                                    variant="outline"
                                >
                                    <Trash2 className="size-4" />
                                    <span className="hidden sm:inline">
                                        Delete
                                    </span>
                                </Button>
                            </ConfirmDialog>
                        </>
                    }
                    backLink={{
                        href: routes.lifting.history,
                        label: 'History',
                    }}
                    className="mb-0"
                    lead={w.notes ?? undefined}
                    title={workoutName(w)}
                />
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="size-3" />
                        {formatDisplayDateTime(w.startedAt)}
                    </span>
                    {durationSeconds !== null && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                            <Flame className="size-3" />
                            {DurationFormat.seconds(durationSeconds)}
                        </span>
                    )}
                    {w.bodyweightKg && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                            <Calendar className="size-3" />
                            {WeightUnit.format(w.bodyweightKg, unitWeight)}{' '}
                            bodyweight
                        </span>
                    )}
                </div>
            </div>

            <StatStrip
                items={[
                    {
                        id: 'exercises',
                        label: 'Exercises',
                        value: stats.exerciseCount.toString(),
                    },
                    {
                        id: 'sets',
                        label: 'Sets',
                        value: stats.totalSets.toString(),
                    },
                    {
                        id: 'volume',
                        label: 'Volume',
                        value:
                            stats.volumeKg > 0 ? (
                                WeightUnit.format(stats.volumeKg, unitWeight)
                            ) : (
                                <MissingValue reason="Volume counts sets that have both a weight and reps." />
                            ),
                    },
                    {
                        id: 'prs',
                        label: 'PRs',
                        value: stats.prs.toString(),
                    },
                ]}
            />

            <ToolPanel contentClassName="flex flex-col gap-4" title="Exercises">
                <div className="flex flex-wrap items-center gap-2">
                    <FilterSelect
                        label="Exercise"
                        onValueChange={(v) =>
                            setExerciseFilter(v ?? FILTER_ALL)
                        }
                        options={exercises.map((wex) => ({
                            label: wex.exercise.name,
                            value: wex.id,
                        }))}
                        placeholder="All exercises"
                        value={
                            exerciseFilter === FILTER_ALL
                                ? undefined
                                : exerciseFilter
                        }
                    />
                    <FilterToggle
                        isPressed={prOnly}
                        label="PRs only"
                        onPressedChange={setPrOnly}
                    />
                    <Input
                        aria-label="Search exercise name"
                        className={SEARCH_FIELD_CLASS}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search exercise name…"
                        value={search}
                    />
                    <ClearFiltersButton active={hasFilters} onReset={reset} />
                </div>

                {filteredExercises.length === 0 ? (
                    <EmptyState
                        description={
                            hasFilters
                                ? 'Try widening the filters.'
                                : 'This workout has no exercises logged.'
                        }
                        icon={Layers}
                        title="No exercises"
                    />
                ) : (
                    <ul className="flex flex-col gap-4">
                        {filteredExercises.map((wex) => (
                            <li key={wex.id}>
                                <ToolPanel
                                    className="gap-2 py-4"
                                    title={wex.exercise.name}
                                >
                                    <DataTable
                                        columns={workoutSetColumns}
                                        data={wex.sets}
                                        emptyState={
                                            <EmptyState
                                                description="This exercise has no sets recorded."
                                                icon={Layers}
                                                title="No sets logged"
                                            />
                                        }
                                        initialColumnVisibility={emptySetColumns(
                                            wex.sets,
                                        )}
                                        pageSize={null}
                                        rowId={(s) => s.id}
                                    />
                                </ToolPanel>
                            </li>
                        ))}
                    </ul>
                )}
            </ToolPanel>
        </div>
    );
}

function emptySetColumns(sets: readonly SetRow[]): Record<string, boolean> {
    return Object.fromEntries(
        OPTIONAL_SET_COLUMNS.filter((column) =>
            sets.every((set) => SET_COLUMN_VALUE[column](set) === null),
        ).map((column) => [column, false]),
    );
}

function SaveAsRoutineButton({ workout }: { workout: WorkoutDetail }) {
    const [isOpen, setIsOpen] = useState(false);
    const utilities = api.useUtils();
    const blocks = useMemo(
        () => RoutineDraft.blocksOf(workout.exercises),
        [workout.exercises],
    );
    const leftOut = RoutineDraft.leftOutCount(workout.exercises);
    const form = useForm<RoutineNameValues>({
        defaultValues: { name: workoutName(workout) },
        resolver: zodResolver(routineNameSchema),
    });
    const create = api.lifting.routine.create.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Routine saved');
            setIsOpen(false);
            await utilities.lifting.routine.list.invalidate();
        },
    });

    return (
        <Dialog
            onOpenChange={(open) => {
                if (open) form.reset({ name: workoutName(workout) });
                setIsOpen(open);
            }}
            open={isOpen}
        >
            <DialogTrigger asChild>
                <Button
                    className="shrink-0 gap-2"
                    disabled={blocks.length === 0}
                    type="button"
                    variant="outline"
                >
                    <BookmarkPlus className="size-4" />
                    Save as routine
                </Button>
            </DialogTrigger>
            <FormDialog
                description={
                    leftOut === 0
                        ? 'Start future workouts with these exercises in one tap.'
                        : `Start future workouts with these exercises in one tap. ${leftOut} custom ${leftOut === 1 ? 'exercise is' : 'exercises are'} left out: routines use built-in exercises only.`
                }
                form={form}
                onCancel={() => setIsOpen(false)}
                onSubmit={(values) =>
                    create.mutate({ blocks, name: values.name })
                }
                pending={create.isPending}
                submitLabel="Save routine"
                title="Save as routine"
            >
                <FormTextField
                    control={form.control}
                    label="Routine name"
                    name="name"
                />
            </FormDialog>
        </Dialog>
    );
}

function SetDetailCell({ value }: { value: null | number | string }) {
    return value === null ? (
        <MissingValue />
    ) : (
        <span className="text-xs text-muted-foreground tabular-nums">
            {value}
        </span>
    );
}
