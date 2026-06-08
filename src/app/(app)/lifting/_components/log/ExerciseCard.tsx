'use client';

import { ChevronDown, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '~/components/ui/AlertDialog';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '~/components/ui/DropDown';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/Tooltip';
import { WeightUnit } from '~/lib/lifting/format';
import {
    SET_TYPE_VALUES,
    type SetType,
    type UnitDistance,
    type UnitWeight,
} from '~/lib/lifting/types';
import { cn } from '~/lib/utils';
import { api, type RouterOutputs } from '~/trpc/react';

import { PlateVisualizer } from '../shared/PlateVisualizer';
import { SetRow, type SetRowData } from './SetRow';

interface ExerciseCardProps {
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
}: ExerciseCardProps) {
    const [platesOpen, setPlatesOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const utils = api.useUtils();
    const invalidate = () => utils.lifting.workout.getActive.invalidate();

    const createSet = api.lifting.set.create.useMutation({
        onSuccess: invalidate,
    });
    const updateSet = api.lifting.set.update.useMutation({
        onSuccess: invalidate,
    });
    const deleteSet = api.lifting.set.delete.useMutation({
        onSuccess: invalidate,
    });
    const removeExercise = api.lifting.workout.removeExercise.useMutation({
        onSuccess: invalidate,
    });

    const lastSet = wex.sets.findLast((s) => s.completedAt !== null);
    const targetRestSeconds =
        wex.exercise.defaultRestSeconds ?? defaultRestSeconds;

    const lastWeight = lastSet?.weightKg ?? 0;
    const lastReps = lastSet?.reps ?? 0;

    const handleAddSet = () => {
        createSet.mutate({
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
            onRequestRest(targetRestSeconds);
        } catch {
            return;
        }
    };

    const heaviestForPlates =
        lastSet?.weightKg ?? wex.sets[0]?.weightKg ?? barWeightKg;

    return (
        <Card className="gap-4 py-4">
            <CardHeader className="pb-0">
                <div>
                    <CardTitle className="text-base">
                        {wex.exercise.name}
                    </CardTitle>
                    {lastSet && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                            Last set:{' '}
                            {lastSet.weightKg === null
                                ? '—'
                                : WeightUnit.format(
                                      lastSet.weightKg,
                                      unitWeight,
                                  )}{' '}
                            × {lastSet.reps ?? '—'}
                        </p>
                    )}
                </div>
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
                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        aria-label="Exercise options"
                                        className="size-9 p-0"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <MoreHorizontal className="size-4 text-muted-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Exercise options</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                className="text-destructive"
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setRemoveOpen(true);
                                }}
                            >
                                <Trash2 className="mr-2 size-4" />
                                Remove exercise
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <AlertDialog onOpenChange={setRemoveOpen} open={removeOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Remove exercise?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {wex.exercise.name} and all logged sets
                                    underneath it will be removed from this
                                    workout.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() =>
                                        removeExercise.mutate({ id: wex.id })
                                    }
                                >
                                    Remove
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardHeader>

            <CardContent>
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
                                    busy={updateSet.isPending}
                                    onComplete={handleCompleteSet}
                                    onDelete={(id) => deleteSet.mutate({ id })}
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
                    disabled={createSet.isPending}
                    onClick={handleAddSet}
                    type="button"
                    variant="outline"
                >
                    <Plus className="size-4" /> Add set
                </Button>
            </CardContent>
        </Card>
    );
}

function normalizeSetType(value: string): SetType {
    return SET_TYPE_VALUES.includes(value as SetType)
        ? (value as SetType)
        : 'working';
}
