'use client';

import { Calendar, Clock, Flame, Layers, Trash2, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '~/components/PageHeader';
import { StatStrip } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { SEARCH_FIELD_CLASS } from '~/components/ui/filter-control';
import { FilterSelect } from '~/components/ui/filter-select';
import { FilterToggle } from '~/components/ui/filter-toggle';
import { Input } from '~/components/ui/input';
import { formatDisplayDateTime } from '~/lib/format';
import { DistanceUnit, DurationFormat, WeightUnit } from '~/lib/lifting/format';
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
                accessorKey: 'weightKg',
                cell: ({ row }) => (
                    <span className="font-semibold tabular-nums">
                        {row.original.weightKg === null
                            ? '-'
                            : WeightUnit.format(
                                  row.original.weightKg,
                                  unitWeight,
                              )}
                    </span>
                ),
                header: 'Weight',
            },
            {
                accessorKey: 'reps',
                cell: ({ row }) => (
                    <span className="font-semibold tabular-nums">
                        × {row.original.reps ?? '-'}
                    </span>
                ),
                header: 'Reps',
            },
            {
                accessorKey: 'rpe',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.rpe ?? '-'}
                    </span>
                ),
                header: 'RPE',
            },
            {
                accessorKey: 'rir',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.rir ?? '-'}
                    </span>
                ),
                header: 'RIR',
            },
            {
                accessorKey: 'tempo',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.tempo ?? '-'}
                    </span>
                ),
                enableSorting: false,
                header: 'Tempo',
            },
            {
                accessorKey: 'distanceM',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.distanceM === null
                            ? '-'
                            : `${DistanceUnit.toDisplay(
                                  row.original.distanceM,
                                  unitDistance,
                              ).toFixed(
                                  unitDistance === 'm' ? 0 : 2,
                              )} ${unitDistance}`}
                    </span>
                ),
                header: 'Distance',
            },
            {
                accessorKey: 'durationS',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.durationS === null
                            ? '-'
                            : DurationFormat.seconds(row.original.durationS)}
                    </span>
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
                        <ConfirmDialog
                            confirmLabel="Delete"
                            description={
                                <>
                                    &ldquo;{workoutName(w)}&rdquo; and all its
                                    sets will be permanently removed. This
                                    cannot be undone.
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
                                <span className="hidden sm:inline">Delete</span>
                            </Button>
                        </ConfirmDialog>
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
                            stats.volumeKg > 0
                                ? WeightUnit.format(stats.volumeKg, unitWeight)
                                : '-',
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
