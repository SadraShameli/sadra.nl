'use client';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { PlateVisualizer } from '~/app/(app)/lifting/_components/shared/PlateVisualizer';
import { RowActionKind, RowActionsMenu } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/tooltip';
import { WeightUnit } from '~/lib/lifting/format';
import {
    SET_TYPE_VALUES,
    type SetType,
    type UnitDistance,
    type UnitWeight,
} from '~/lib/lifting/types';
import { cn } from '~/lib/utilities';
import { type RouterOutputs, useTRPC } from '~/trpc/react';

import { SetRow, type SetRowData } from './SetRow';

interface ExerciseCardProperties {
    availablePlatesKg: readonly number[];
    barWeightKg: number;
    defaultRestSeconds: number;
    onRequestRest: (seconds: number) => void;
    unitDistance: UnitDistance;
    unitWeight: UnitWeight;
    workoutExercise: WorkoutExercise;
}

type WorkoutExercise = WorkoutWithSets['exercises'][number];

type WorkoutWithSets = NonNullable<
    RouterOutputs['lifting']['workout']['getActive']
>;

export function ExerciseCard({
    availablePlatesKg,
    barWeightKg,
    defaultRestSeconds,
    onRequestRest,
    unitDistance,
    unitWeight,
    workoutExercise: wex,
}: ExerciseCardProperties) {
    const api = useTRPC();
    const [platesOpen, setPlatesOpen] = useState(false);
    const queryClient = useQueryClient();
    const invalidate = () =>
        queryClient.invalidateQueries(
            api.lifting.workout.getActive.pathFilter(),
        );

    const workoutSetCreation = useMutation(
        api.lifting.set.create.mutationOptions({
            onSuccess: invalidate,
        }),
    );
    const updateSet = useMutation(
        api.lifting.set.update.mutationOptions({
            onSuccess: invalidate,
        }),
    );
    const completeSet = useMutation(
        api.lifting.set.complete.mutationOptions({
            onSuccess: invalidate,
        }),
    );
    const workoutSetDeletion = useMutation(
        api.lifting.set.delete.mutationOptions({
            onSuccess: invalidate,
        }),
    );
    const exerciseRemoval = useMutation(
        api.lifting.workout.removeExercise.mutationOptions({
            onSuccess: invalidate,
        }),
    );

    const lastSet = wex.sets.findLast((s) => s.completedAt !== null);
    const targetRestSeconds =
        wex.exercise.defaultRestSeconds ?? defaultRestSeconds;

    const lastWeight = lastSet?.weightKg ?? 0;
    const lastReps = lastSet?.reps ?? 0;

    const handleAddSet = () => {
        workoutSetCreation.mutate({
            reps: lastReps,
            type: 'working',
            weightKg: lastWeight,
            workoutExerciseId: wex.id,
        });
    };

    const handleCompleteSet = async (
        id: string,
        values: {
            distanceM: null | number;
            durationS: null | number;
            reps: null | number;
            rir: null | number;
            rpe: null | number;
            tempo: null | string;
            weightKg: null | number;
        },
    ) => {
        try {
            await updateSet.mutateAsync({
                distanceM: values.distanceM,
                durationS: values.durationS,
                id,
                notes: null,
                reps: values.reps,
                rir: values.rir,
                rpe: values.rpe,
                tempo: values.tempo,
                type: 'working',
                weightKg: values.weightKg,
            });
            const isPending =
                wex.sets.find((candidate) => candidate.id === id)
                    ?.completedAt === null;
            if (isPending) await completeSet.mutateAsync({ id });
            onRequestRest(targetRestSeconds);
        } catch {
            return;
        }
    };

    const heaviestForPlates =
        lastSet?.weightKg ?? wex.sets[0]?.weightKg ?? barWeightKg;

    return (
        <ToolPanel
            actions={
                <div className="flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                aria-label="Toggle plates"
                                className="size-9 p-0"
                                onClick={() => setPlatesOpen((s) => !s)}
                                type="button"
                                variant="ghost"
                            >
                                <ChevronDown
                                    className={cn(
                                        'size-4 text-muted-foreground transition',
                                        platesOpen && 'rotate-180',
                                    )}
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Toggle plates</TooltipContent>
                    </Tooltip>
                    <RowActionsMenu
                        actions={[
                            {
                                confirm: {
                                    confirmLabel: 'Remove',
                                    description: `${wex.exercise.name} and all logged sets underneath it will be removed from this workout.`,
                                    title: 'Remove exercise?',
                                },
                                icon: Trash2,
                                isDestructive: true,
                                kind: RowActionKind.Select,
                                label: 'Remove exercise',
                                onSelect: () =>
                                    exerciseRemoval.mutate({
                                        id: wex.id,
                                    }),
                            },
                        ]}
                        isPending={exerciseRemoval.isPending}
                        label={wex.exercise.name}
                    />
                </div>
            }
            className="gap-4 py-4"
            contentClassName="gap-0"
            description={
                lastSet === undefined ? undefined : (
                    <span className="tabular-nums">
                        Last set:{' '}
                        {lastSet.weightKg === null
                            ? '-'
                            : WeightUnit.format(
                                  lastSet.weightKg,
                                  unitWeight,
                              )}{' '}
                        × {lastSet.reps ?? '-'}
                    </span>
                )
            }
            title={wex.exercise.name}
        >
            {platesOpen && (
                <div className="mb-3">
                    <PlateVisualizer
                        availableKg={availablePlatesKg}
                        barKg={barWeightKg}
                        targetKg={heaviestForPlates}
                        unitWeight={unitWeight}
                    />
                </div>
            )}

            <ul className="flex flex-col gap-2">
                {wex.sets.map((s) => {
                    const data: SetRowData = {
                        completedAt: s.completedAt,
                        distanceM: s.distanceM,
                        durationS: s.durationS,
                        id: s.id,
                        order: s.order,
                        reps: s.reps,
                        rir: s.rir,
                        rpe: s.rpe,
                        tempo: s.tempo,
                        type: normalizeSetType(s.type),
                        weightKg: s.weightKg,
                    };
                    return (
                        <li key={s.id}>
                            <SetRow
                                busy={
                                    updateSet.isPending || completeSet.isPending
                                }
                                onComplete={handleCompleteSet}
                                onDelete={(id) =>
                                    workoutSetDeletion.mutate({ id })
                                }
                                set={data}
                                unitDistance={unitDistance}
                                unitWeight={unitWeight}
                            />
                        </li>
                    );
                })}
            </ul>

            <Button
                className="mt-3 gap-2 self-start"
                disabled={workoutSetCreation.isPending}
                onClick={handleAddSet}
                type="button"
                variant="outline"
            >
                <Plus className="size-4" /> Add set
            </Button>
        </ToolPanel>
    );
}

function normalizeSetType(value: string): SetType {
    return SET_TYPE_VALUES.includes(value as SetType)
        ? (value as SetType)
        : 'working';
}
