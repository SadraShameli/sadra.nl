'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
    ArrowLeft,
    Calendar,
    Flame,
    Layers,
    Trash2,
    Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Checkbox } from '~/components/ui/Checkbox';
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
import { DistanceUnit, DurationFormat, WeightUnit } from '~/lib/lifting/format';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type SetRow = WorkoutDetail['exercises'][number]['sets'][number];
type WorkoutDetail = RouterOutputs['lifting']['workout']['get'];
interface WorkoutDetailViewProps {
    initial: WorkoutDetail;
}

type WorkoutExercise = WorkoutDetail['exercises'][number];

const FILTER_ALL = '__all__';

export function WorkoutDetailView({ initial }: WorkoutDetailViewProps) {
    const router = useRouter();
    const utils = api.useUtils();
    const workout = api.lifting.workout.get.useQuery(
        { id: initial.id },
        { initialData: initial },
    );
    const remove = api.lifting.workout.delete.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Workout deleted');
            await utils.lifting.workout.list.invalidate();
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
                if (exerciseFilter !== FILTER_ALL && wex.id !== exerciseFilter)
                    return false;
                if (q && !wex.exercise.name.toLowerCase().includes(q))
                    return false;
                return true;
            })
            .map((wex) =>
                prOnly ? { ...wex, sets: wex.sets.filter((s) => s.isPr) } : wex,
            )
            .filter((wex) => (prOnly ? wex.sets.length > 0 : true));
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

    const setColumns = useMemo<ColumnDef<SetRow>[]>(
        () => [
            {
                accessorKey: 'order',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        Set {row.original.order}
                    </span>
                ),
                header: 'Set',
            },
            {
                accessorKey: 'weightKg',
                cell: ({ row }) => (
                    <span className="font-semibold tabular-nums">
                        {row.original.weightKg === null
                            ? '—'
                            : WeightUnit.format(
                                  row.original.weightKg,
                                  unitWeight,
                              )}
                    </span>
                ),
                header: () => <span className="block">Weight</span>,
            },
            {
                accessorKey: 'reps',
                cell: ({ row }) => (
                    <span className="font-semibold tabular-nums">
                        × {row.original.reps ?? '—'}
                    </span>
                ),
                header: 'Reps',
            },
            {
                accessorKey: 'rpe',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.rpe ?? '—'}
                    </span>
                ),
                header: 'RPE',
            },
            {
                accessorKey: 'rir',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.rir ?? '—'}
                    </span>
                ),
                header: 'RIR',
            },
            {
                accessorKey: 'tempo',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.tempo ?? '—'}
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
                            ? '—'
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
                            ? '—'
                            : DurationFormat.seconds(row.original.durationS)}
                    </span>
                ),
                header: 'Duration',
            },
            {
                cell: ({ row }) =>
                    row.original.isPr ? (
                        <Badge className="gap-1" variant="warning">
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
            <Button
                asChild
                className="gap-2 self-start text-muted-foreground"
                variant="ghost"
            >
                <Link href={routes.lifting.history}>
                    <ArrowLeft className="size-4" /> History
                </Link>
            </Button>

            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        {format(
                            new Date(w.startedAt),
                            'EEEE · MMMM d, y · HH:mm',
                        )}
                    </p>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        {w.name ?? 'Workout'}
                    </h1>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {durationSeconds !== null && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                                <Flame className="size-3" />
                                {DurationFormat.seconds(durationSeconds)}
                            </span>
                        )}
                        {w.bodyweightKg && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                                <Calendar className="size-3" />
                                {WeightUnit.format(
                                    w.bodyweightKg,
                                    unitWeight,
                                )}{' '}
                                bodyweight
                            </span>
                        )}
                    </div>
                    {w.notes && (
                        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                            {w.notes}
                        </p>
                    )}
                </div>

                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            aria-label="Delete workout"
                            className="shrink-0 gap-2 text-muted-foreground hover:text-destructive"
                            type="button"
                            variant="outline"
                        >
                            <Trash2 className="size-4" />
                            <span className="hidden sm:inline">Delete</span>
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete workout?</AlertDialogTitle>
                            <AlertDialogDescription>
                                &ldquo;{w.name ?? 'Workout'}&rdquo; and all its
                                sets will be permanently removed. This cannot be
                                undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                disabled={remove.isPending}
                                onClick={() => remove.mutate({ id: w.id })}
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </header>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                    label="Exercises"
                    value={stats.exerciseCount.toString()}
                />
                <StatCard label="Sets" value={stats.totalSets.toString()} />
                <StatCard
                    label="Volume"
                    value={
                        stats.volumeKg > 0
                            ? WeightUnit.format(stats.volumeKg, unitWeight)
                            : '—'
                    }
                />
                <StatCard label="PRs" value={stats.prs.toString()} />
            </section>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        Exercises
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_auto_auto]">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Exercise</Label>
                            <Select
                                onValueChange={setExerciseFilter}
                                value={exerciseFilter}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>
                                        All exercises
                                    </SelectItem>
                                    {exercises.map((wex) => (
                                        <SelectItem key={wex.id} value={wex.id}>
                                            {wex.exercise.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Search</Label>
                            <Input
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search exercise name…"
                                value={search}
                            />
                        </div>
                        <label
                            className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 text-xs whitespace-nowrap"
                            htmlFor="workout-pr-only"
                        >
                            <Checkbox
                                checked={prOnly}
                                id="workout-pr-only"
                                onCheckedChange={(v) => setPrOnly(v === true)}
                            />
                            PRs only
                        </label>
                        <Button
                            disabled={!hasFilters}
                            onClick={reset}
                            type="button"
                            variant="outline"
                        >
                            Reset
                        </Button>
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
                                    <Card className="gap-2 py-4">
                                        <CardHeader>
                                            <CardTitle className="text-base">
                                                {wex.exercise.name}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <DataTable
                                                columns={setColumns}
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
                                        </CardContent>
                                    </Card>
                                </li>
                            ))}
                        </ul>
                    )}
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
