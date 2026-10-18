import { type ZodNumber } from 'zod';

import { isWorkingSetType } from '~/lib/lifting/math/volume';
import {
    type CreateRoutineInput,
    routineBlockSchema,
} from '~/lib/lifting/schemas';
import { type SetType } from '~/lib/lifting/types';

export interface RoutineSourceExercise {
    readonly exercise: {
        readonly isCustom: boolean;
        readonly slug: string;
    };
    readonly sets: readonly RoutineSourceSet[];
}

type RoutineBlock = CreateRoutineInput['blocks'][number];

interface RoutineSourceSet {
    readonly reps: null | number;
    readonly type: SetType;
}

const SETS_SCHEMA = routineBlockSchema.shape.sets;
const TARGET_REPS_SCHEMA = routineBlockSchema.shape.targetReps.unwrap();

export const RoutineDraft = {
    blocksOf(exercises: readonly RoutineSourceExercise[]): RoutineBlock[] {
        return exercises.map((source) => {
            const counted = countedSetsOf(source);
            const reps = counted.find(
                (set) => set.reps !== null && set.reps > 0,
            )?.reps;
            return {
                exerciseSlug: source.exercise.slug,
                isCustom: source.exercise.isCustom,
                sets: clampTo(counted.length, SETS_SCHEMA),
                targetReps:
                    reps === null || reps === undefined
                        ? undefined
                        : clampTo(reps, TARGET_REPS_SCHEMA),
            };
        });
    },
};

function clampTo(value: number, schema: ZodNumber): number {
    const min = schema.minValue ?? value;
    const max = schema.maxValue ?? value;
    return Math.min(Math.max(value, min), max);
}

function countedSetsOf(
    source: RoutineSourceExercise,
): readonly RoutineSourceSet[] {
    const working = source.sets.filter((set) => isWorkingSetType(set.type));
    return working.length > 0 ? working : source.sets;
}
