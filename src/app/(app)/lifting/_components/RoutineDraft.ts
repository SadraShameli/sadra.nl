import { type ZodNumber } from 'zod';

import {
    type CreateRoutineInput,
    routineBlockSchema,
} from '~/lib/lifting/schemas';

export interface RoutineSourceExercise {
    readonly exercise: {
        readonly ownerId: null | string;
        readonly slug: string;
    };
    readonly sets: readonly { readonly reps: null | number }[];
}

type RoutineBlock = CreateRoutineInput['blocks'][number];

const SETS_SCHEMA = routineBlockSchema.shape.sets;
const TARGET_REPS_SCHEMA = routineBlockSchema.shape.targetReps.unwrap();

export const RoutineDraft = {
    blocksOf(exercises: readonly RoutineSourceExercise[]): RoutineBlock[] {
        return exercises.filter(isRoutineExercise).map((source) => {
            const reps = source.sets.find(
                (set) => set.reps !== null && set.reps > 0,
            )?.reps;
            return {
                exerciseSlug: source.exercise.slug,
                sets: clampTo(source.sets.length, SETS_SCHEMA),
                targetReps:
                    reps === null || reps === undefined
                        ? undefined
                        : clampTo(reps, TARGET_REPS_SCHEMA),
            };
        });
    },

    leftOutCount(exercises: readonly RoutineSourceExercise[]): number {
        return exercises.filter((source) => !isRoutineExercise(source)).length;
    },
};

function clampTo(value: number, schema: ZodNumber): number {
    const min = schema.minValue ?? value;
    const max = schema.maxValue ?? value;
    return Math.min(Math.max(value, min), max);
}

function isRoutineExercise(source: RoutineSourceExercise): boolean {
    return source.exercise.ownerId === null;
}
