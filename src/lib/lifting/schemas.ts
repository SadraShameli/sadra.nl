import { z } from 'zod';

import {
    EQUIPMENT_VALUES,
    FORCE_VALUES,
    GOAL_KIND_VALUES,
    GOAL_STATUS_VALUES,
    MEASUREMENT_KIND_VALUES,
    MEASUREMENT_UNIT_VALUES,
    MECHANIC_VALUES,
    MUSCLE_VALUES,
    PR_KIND_VALUES,
    PROGRAM_CATEGORY_VALUES,
    SET_TYPE_VALUES,
    UNIT_DISTANCE_VALUES,
    UNIT_LENGTH_VALUES,
    UNIT_WEIGHT_VALUES,
    USER_PROGRAM_STATUS_VALUES,
    WEEK_START_VALUES,
} from '~/lib/lifting/types';

export const equipmentSchema = z.enum(EQUIPMENT_VALUES);
export const mechanicSchema = z.enum(MECHANIC_VALUES);
export const forceSchema = z.enum(FORCE_VALUES);
export const muscleSchema = z.enum(MUSCLE_VALUES);
export const workoutSetTypeSchema = z.enum(SET_TYPE_VALUES);
export const prKindSchema = z.enum(PR_KIND_VALUES);
export const measurementKindSchema = z.enum(MEASUREMENT_KIND_VALUES);
export const measurementUnitSchema = z.enum(MEASUREMENT_UNIT_VALUES);
export const goalKindSchema = z.enum(GOAL_KIND_VALUES);
export const goalStatusSchema = z.enum(GOAL_STATUS_VALUES);
export const userProgramStatusSchema = z.enum(USER_PROGRAM_STATUS_VALUES);
export const programCategorySchema = z.enum(PROGRAM_CATEGORY_VALUES);
export const unitWeightSchema = z.enum(UNIT_WEIGHT_VALUES);
export const unitDistanceSchema = z.enum(UNIT_DISTANCE_VALUES);
export const unitLengthSchema = z.enum(UNIT_LENGTH_VALUES);
export const weekStartSchema = z.enum(WEEK_START_VALUES);

const slugRegex = /^[a-z0-9-]+$/;

export const exerciseSlugSchema = z
    .string()
    .min(1)
    .max(96)
    .regex(slugRegex, 'Lowercase letters, numbers, and hyphens only.');

export const customExerciseInputSchema = z.object({
    defaultRestSeconds: z.number().int().min(0).max(3600).optional(),
    equipment: equipmentSchema,
    force: forceSchema,
    imageUrl: z.url().max(2048).nullable().optional(),
    instructions: z.string().max(4000).nullable().optional(),
    mechanic: mechanicSchema,
    name: z.string().trim().min(1).max(128),
    primaryMuscle: muscleSchema,
    secondaryMuscles: z.array(muscleSchema).default([]),
    tags: z.array(z.string().trim().min(1).max(32)).default([]),
    videoUrl: z.url().max(2048).nullable().optional(),
});

export type CreateCustomExerciseInput = z.infer<
    typeof customExerciseInputSchema
>;

export const updateCustomExerciseInputSchema = customExerciseInputSchema.extend(
    {
        id: z.uuid(),
    },
);

export type UpdateCustomExerciseInput = z.infer<
    typeof updateCustomExerciseInputSchema
>;

export const listExercisesInputSchema = z.object({
    equipment: equipmentSchema.optional(),
    includeCustom: z.boolean().default(true),
    limit: z.number().int().min(1).max(500).default(100),
    muscle: muscleSchema.optional(),
    offset: z.number().int().nonnegative().default(0),
    search: z.string().trim().max(128).optional(),
});

export type ListExercisesInput = z.infer<typeof listExercisesInputSchema>;

export const exerciseIdActionSchema = z.object({ id: z.uuid() });
export type ExerciseIdAction = z.infer<typeof exerciseIdActionSchema>;

export const exerciseSlugActionSchema = z.object({ slug: exerciseSlugSchema });
export type ExerciseSlugAction = z.infer<typeof exerciseSlugActionSchema>;

export const settingsFormSchema = z.object({
    availablePlatesKg: z.array(z.number().positive().max(100)).min(1).max(20),
    barWeightKg: z.number().positive().max(100),
    defaultRestSeconds: z.number().int().min(0).max(3600),
    unitDistance: unitDistanceSchema,
    unitLength: unitLengthSchema,
    unitWeight: unitWeightSchema,
    weekStart: weekStartSchema,
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export const updateSettingsInputSchema = settingsFormSchema.partial();

export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const idActionSchema = z.object({ id: z.uuid() });
export type IdAction = z.infer<typeof idActionSchema>;

export const startWorkoutInputSchema = z.object({
    name: z.string().trim().max(128).optional(),
    programDayRef: z
        .object({
            day: z.number().int().min(1).max(7),
            userProgramId: z.uuid(),
            week: z.number().int().min(1).max(52),
        })
        .optional(),
    routineId: z.uuid().optional(),
});
export type StartWorkoutInput = z.infer<typeof startWorkoutInputSchema>;

export const updateWorkoutInputSchema = z.object({
    bodyweightKg: z.number().positive().max(500).nullable().optional(),
    id: z.uuid(),
    locationTag: z.string().trim().max(64).nullable().optional(),
    name: z.string().trim().max(128).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    rpeOverall: z.number().min(1).max(10).nullable().optional(),
});
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutInputSchema>;

export const listWorkoutsInputSchema = z.object({
    from: z.date().optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().nonnegative().default(0),
    to: z.date().optional(),
});
export type ListWorkoutsInput = z.infer<typeof listWorkoutsInputSchema>;

export const exerciseToWorkoutInputSchema = z.object({
    exerciseId: z.uuid(),
    supersetGroup: z.number().int().min(1).max(99).nullable().optional(),
    workoutId: z.uuid(),
});
export type AddExerciseToWorkoutInput = z.infer<
    typeof exerciseToWorkoutInputSchema
>;

export const reorderWorkoutExercisesInputSchema = z.object({
    orderedIds: z.array(z.uuid()).min(1),
    workoutId: z.uuid(),
});
export type ReorderWorkoutExercisesInput = z.infer<
    typeof reorderWorkoutExercisesInputSchema
>;

export const workoutSetInputSchema = z.object({
    distanceM: z.number().nonnegative().max(100_000).nullable().optional(),
    durationS: z.number().int().nonnegative().max(86_400).nullable().optional(),
    notes: z.string().max(1024).nullable().optional(),
    reps: z.number().int().nonnegative().max(1000).nullable().optional(),
    rir: z.number().min(0).max(10).nullable().optional(),
    rpe: z.number().min(1).max(10).nullable().optional(),
    tempo: z
        .string()
        .regex(/^\d-\d-\d-\d$/, 'Use 4-0-1-0 format.')
        .nullable()
        .optional(),
    type: workoutSetTypeSchema,
    weightKg: z.number().nonnegative().max(1500).nullable().optional(),
    workoutExerciseId: z.uuid(),
});
export type CreateSetInput = z.infer<typeof workoutSetInputSchema>;

export const updateSetInputSchema = workoutSetInputSchema
    .omit({ workoutExerciseId: true })
    .extend({ id: z.uuid() });
export type UpdateSetInput = z.infer<typeof updateSetInputSchema>;

export const completeSetInputSchema = z.object({
    completedAt: z.date().optional(),
    id: z.uuid(),
});
export type CompleteSetInput = z.infer<typeof completeSetInputSchema>;

export const oneRmKgSchema = z.number().positive().max(1500);
export const enrollProgramInputSchema = z.object({
    oneRepMaxes: z.record(z.string(), oneRmKgSchema),
    programId: z.uuid(),
    startDate: dateStringSchema,
});
export type EnrollProgramInput = z.infer<typeof enrollProgramInputSchema>;

export const updateUserProgramInputSchema = z.object({
    currentDay: z.number().int().min(1).max(7).optional(),
    currentWeek: z.number().int().min(1).max(52).optional(),
    id: z.uuid(),
    oneRepMaxes: z
        .record(z.string(), z.number().positive().max(1500))
        .optional(),
    status: userProgramStatusSchema.optional(),
});
export type UpdateUserProgramInput = z.infer<
    typeof updateUserProgramInputSchema
>;

export const routineBlockSchema = z.object({
    exerciseSlug: exerciseSlugSchema,
    notes: z.string().max(256).optional(),
    restSeconds: z.number().int().min(0).max(3600).optional(),
    sets: z.number().int().min(1).max(20),
    targetReps: z.number().int().min(1).max(100).optional(),
    targetRpe: z.number().min(1).max(10).optional(),
});

export const routineInputSchema = z.object({
    blocks: z.array(routineBlockSchema).min(1).max(40),
    name: z.string().trim().min(1).max(128),
});
export type CreateRoutineInput = z.infer<typeof routineInputSchema>;

export const updateRoutineInputSchema = routineInputSchema.extend({
    id: z.uuid(),
    sortOrder: z.number().int().nonnegative().optional(),
});
export type UpdateRoutineInput = z.infer<typeof updateRoutineInputSchema>;

export const reorderRoutinesInputSchema = z.object({
    orderedIds: z.array(z.uuid()).min(1),
});
export type ReorderRoutinesInput = z.infer<typeof reorderRoutinesInputSchema>;

export const measurementInputSchema = z.object({
    kind: measurementKindSchema,
    notes: z.string().max(1024).nullable().optional(),
    takenAt: z.date().optional(),
    unit: measurementUnitSchema,
    valueNumeric: z.number().min(0).max(1000),
});
export type CreateMeasurementInput = z.infer<typeof measurementInputSchema>;

export const updateMeasurementInputSchema = measurementInputSchema.extend({
    id: z.uuid(),
});
export type UpdateMeasurementInput = z.infer<
    typeof updateMeasurementInputSchema
>;

export const listMeasurementsInputSchema = z.object({
    from: z.date().optional(),
    kind: measurementKindSchema.optional(),
    to: z.date().optional(),
});
export type ListMeasurementsInput = z.infer<typeof listMeasurementsInputSchema>;

export const goalInputSchema = z.object({
    exerciseId: z.uuid().nullable().optional(),
    kind: goalKindSchema,
    targetDate: dateStringSchema.nullable().optional(),
    targetValue: z.number().positive().max(100_000),
});
export type CreateGoalInput = z.infer<typeof goalInputSchema>;

export const updateGoalInputSchema = goalInputSchema.extend({
    id: z.uuid(),
    status: goalStatusSchema.optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalInputSchema>;

export const listGoalsInputSchema = z.object({
    status: goalStatusSchema.optional(),
});
export type ListGoalsInput = z.infer<typeof listGoalsInputSchema>;

export const dateRangeInputSchema = z.object({
    from: z.date(),
    to: z.date(),
});
export type DateRangeInput = z.infer<typeof dateRangeInputSchema>;

export const exerciseRangeInputSchema = z.object({
    exerciseId: z.uuid(),
    from: z.date().optional(),
    to: z.date().optional(),
});
export type ExerciseRangeInput = z.infer<typeof exerciseRangeInputSchema>;

export const consistencyInputSchema = z.object({
    trailingWeeks: z.number().int().min(1).max(52).default(4),
});
export type ConsistencyInput = z.infer<typeof consistencyInputSchema>;
