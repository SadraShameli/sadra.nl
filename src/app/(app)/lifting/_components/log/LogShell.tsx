'use client';

import { Clock, Dumbbell, Flag, Play, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { EmptyState } from '~/components/ui/EmptyState';
import { Skeleton } from '~/components/ui/Skeleton';
import { DurationFormat } from '~/lib/lifting/format';
import {
    UNIT_DISTANCE_VALUES,
    UNIT_WEIGHT_VALUES,
    type UnitDistance,
    type UnitWeight,
} from '~/lib/lifting/types';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api, type RouterOutputs } from '~/trpc/react';

import { RestTimerOverlay } from '../shared/RestTimerOverlay';
import { AddExerciseSheet } from './AddExerciseSheet';
import { ExerciseCard } from './ExerciseCard';

interface LogShellProps {
    initialSettings: Settings;
}

type Settings = RouterOutputs['lifting']['settings']['get'];

export function LogShell({ initialSettings }: LogShellProps) {
    const router = useRouter();
    const utils = api.useUtils();
    const activeWorkout = api.lifting.workout.getActive.useQuery();
    const startWorkout = api.lifting.workout.start.useMutation({
        onSuccess: () => utils.lifting.workout.getActive.invalidate(),
    });
    const endWorkout = api.lifting.workout.end.useMutation({
        onSuccess: async () => {
            await utils.lifting.workout.getActive.invalidate();
            router.push(routes.lifting.history);
        },
    });
    const addExercise = api.lifting.workout.addExercise.useMutation({
        onSuccess: () => utils.lifting.workout.getActive.invalidate(),
    });

    const [timerOpen, setTimerOpen] = useState(false);
    const [timerSeconds, setTimerSeconds] = useState(
        initialSettings.defaultRestSeconds,
    );
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
        const w = activeWorkout.data;
        if (!w) return;
        const startMs = new Date(w.startedAt).getTime();
        setElapsedMs(Date.now() - startMs);
        const tick = setInterval(() => {
            setElapsedMs(Date.now() - startMs);
        }, 1000);
        return () => clearInterval(tick);
    }, [activeWorkout.data]);

    if (activeWorkout.isLoading) {
        return (
            <div>
                <Skeleton className="mb-4 h-16 w-full rounded-2xl" />
                <div className="flex flex-col gap-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton className="h-48 w-full rounded-2xl" key={i} />
                    ))}
                </div>
            </div>
        );
    }

    const workout = activeWorkout.data;

    if (!workout) {
        return (
            <div>
                <Card className="mx-auto max-w-md">
                    <CardContent>
                        <EmptyState
                            action={
                                <Button
                                    className="gap-2"
                                    disabled={startWorkout.isPending}
                                    onClick={() => startWorkout.mutate({})}
                                    type="button"
                                >
                                    <Play className="size-4" />
                                    {startWorkout.isPending
                                        ? 'Starting…'
                                        : 'Start workout'}
                                </Button>
                            }
                            description="Start an empty workout and add exercises as you go."
                            icon={Dumbbell}
                            title="No active workout"
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    const unitWeight = normalizeUnitWeight(initialSettings.unitWeight);
    const unitDistance = normalizeUnitDistance(initialSettings.unitDistance);

    return (
        <div className="pb-8">
            <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-2 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
                <div className="flex items-center gap-3">
                    <Clock className="size-4 text-muted-foreground" />
                    <div>
                        <p className="text-xs text-muted-foreground">Elapsed</p>
                        <p className="text-lg font-semibold tabular-nums">
                            {DurationFormat.elapsedSince(
                                Date.now() - elapsedMs,
                                Date.now(),
                            )}
                        </p>
                    </div>
                </div>
                <Button
                    className="gap-1"
                    disabled={endWorkout.isPending}
                    onClick={() => endWorkout.mutate({ id: workout.id })}
                    type="button"
                    variant="outline"
                >
                    <Flag className="size-4" />
                    {endWorkout.isPending ? 'Finishing…' : 'Finish'}
                </Button>
            </header>

            <ul className="flex flex-col gap-4">
                {workout.exercises.map((wex) => (
                    <li key={wex.id}>
                        <ExerciseCard
                            availablePlatesKg={
                                initialSettings.availablePlatesKg
                            }
                            barWeightKg={initialSettings.barWeightKg}
                            defaultRestSeconds={
                                initialSettings.defaultRestSeconds
                            }
                            onRequestRest={(seconds) => {
                                setTimerSeconds(seconds);
                                setTimerOpen(true);
                            }}
                            unitDistance={unitDistance}
                            unitWeight={unitWeight}
                            workoutExercise={wex}
                        />
                    </li>
                ))}
            </ul>

            <div className="mt-6">
                <AddExerciseSheet
                    onAdd={(exerciseId) =>
                        addExercise.mutate({
                            exerciseId,
                            workoutId: workout.id,
                        })
                    }
                />
            </div>

            <div className="fixed right-0 bottom-4 left-0 z-20 flex justify-center px-4 sm:hidden">
                <Button
                    className={cn(
                        'flex h-12 w-full items-center justify-center gap-2 rounded-full shadow-lg',
                    )}
                    onClick={() => endWorkout.mutate({ id: workout.id })}
                    type="button"
                    variant="outline"
                >
                    <Square className="size-4" /> Finish workout
                </Button>
            </div>

            <RestTimerOverlay
                onClose={() => setTimerOpen(false)}
                open={timerOpen}
                seconds={timerSeconds}
            />
        </div>
    );
}

function normalizeUnitDistance(value: string): UnitDistance {
    const trimmed = value.trim() as UnitDistance;
    return UNIT_DISTANCE_VALUES.includes(trimmed) ? trimmed : 'm';
}

function normalizeUnitWeight(value: string): UnitWeight {
    const trimmed = value.trim() as UnitWeight;
    return UNIT_WEIGHT_VALUES.includes(trimmed) ? trimmed : 'kg';
}
