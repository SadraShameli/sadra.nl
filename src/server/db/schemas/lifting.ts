import { sql } from 'drizzle-orm';
import {
    boolean,
    index,
    integer,
    jsonb,
    real,
    serial,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type {
    AvailablePlatesKg,
    Equipment,
    ForceVector,
    GoalKind,
    GoalStatus,
    MeasurementKind,
    MeasurementUnit,
    Mechanic,
    MuscleGroup,
    OneRepMaxMap,
    PrKind,
    ProgramCategory,
    ProgramDayRef,
    ProgramSchedule,
    RoutineBlock,
    SetType,
    UnitDistance,
    UnitLength,
    UnitWeight,
    UserProgramStatus,
    WeekStart,
} from '~/lib/lifting/types';

import { createTable } from './main';

export const liftingExercise = createTable(
    'lifting_exercise',
    {
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        defaultRestSeconds: integer('default_rest_seconds'),
        equipment: varchar('equipment', { length: 32 })
            .$type<Equipment>()
            .notNull(),
        force: varchar('force', { length: 16 }).$type<ForceVector>().notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        imageUrl: text('image_url'),
        instructions: text('instructions'),
        isCustom: boolean('is_custom').notNull().default(false),
        mechanic: varchar('mechanic', { length: 16 })
            .$type<Mechanic>()
            .notNull(),
        name: varchar('name', { length: 128 }).notNull(),
        ownerId: text('owner_id'),
        primaryMuscle: varchar('primary_muscle', { length: 32 })
            .$type<MuscleGroup>()
            .notNull(),
        secondaryMuscles: jsonb('secondary_muscles')
            .$type<MuscleGroup[]>()
            .notNull()
            .default([]),
        slug: varchar('slug', { length: 96 }).notNull(),
        tags: jsonb('tags').$type<string[]>().notNull().default([]),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        videoUrl: text('video_url'),
    },
    (table) => [
        uniqueIndex('lifting_exercise_slug_global_idx')
            .on(table.slug)
            .where(sql`${table.ownerId} IS NULL`),
        uniqueIndex('lifting_exercise_slug_owner_idx')
            .on(table.slug, table.ownerId)
            .where(sql`${table.ownerId} IS NOT NULL`),
        index('lifting_exercise_owner_name_idx').on(table.ownerId, table.name),
        index('lifting_exercise_primary_muscle_idx').on(table.primaryMuscle),
        index('lifting_exercise_equipment_idx').on(table.equipment),
        index('lifting_exercise_name_trgm_idx').using(
            'gin',
            sql`${table.name} gin_trgm_ops`,
        ),
    ],
);

export const liftingExerciseAlias = createTable(
    'lifting_exercise_alias',
    {
        alias: varchar('alias', { length: 96 }).notNull(),
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => liftingExercise.id, { onDelete: 'cascade' }),
        id: serial('id').primaryKey(),
    },
    (table) => [
        uniqueIndex('lifting_exercise_alias_exercise_alias_idx').on(
            table.exerciseId,
            table.alias,
        ),
        index('lifting_exercise_alias_alias_idx').on(table.alias),
    ],
);

export const liftingProgram = createTable(
    'lifting_program',
    {
        category: varchar('category', { length: 32 })
            .$type<ProgramCategory>()
            .notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        daysPerWeek: integer('days_per_week').notNull(),
        description: text('description'),
        id: uuid('id').primaryKey().defaultRandom(),
        isOfficial: boolean('is_official').notNull().default(false),
        isPublic: boolean('is_public').notNull().default(false),
        lengthWeeks: integer('length_weeks').notNull(),
        name: varchar('name', { length: 128 }).notNull(),
        ownerId: text('owner_id'),
        schedule: jsonb('schedule').$type<ProgramSchedule>().notNull(),
        slug: varchar('slug', { length: 96 }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
    },
    (table) => [
        uniqueIndex('lifting_program_slug_global_idx')
            .on(table.slug)
            .where(sql`${table.ownerId} IS NULL`),
        uniqueIndex('lifting_program_slug_owner_idx')
            .on(table.slug, table.ownerId)
            .where(sql`${table.ownerId} IS NOT NULL`),
        index('lifting_program_owner_idx').on(table.ownerId),
    ],
);

export const liftingUserProgram = createTable(
    'lifting_user_program',
    {
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        currentDay: integer('current_day').notNull().default(1),
        currentWeek: integer('current_week').notNull().default(1),
        id: uuid('id').primaryKey().defaultRandom(),
        oneRepMaxes: jsonb('one_rep_maxes')
            .$type<OneRepMaxMap>()
            .notNull()
            .default({}),
        programId: uuid('program_id')
            .notNull()
            .references(() => liftingProgram.id, { onDelete: 'cascade' }),
        startDate: varchar('start_date', { length: 10 }).notNull(),
        status: varchar('status', { length: 16 })
            .$type<UserProgramStatus>()
            .notNull()
            .default('active'),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        index('lifting_user_program_user_status_idx').on(
            table.userId,
            table.status,
        ),
    ],
);

export const liftingRoutine = createTable(
    'lifting_routine',
    {
        blocks: jsonb('blocks').$type<RoutineBlock[]>().notNull().default([]),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: 128 }).notNull(),
        sortOrder: integer('sort_order').notNull().default(0),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        index('lifting_routine_user_sort_idx').on(
            table.userId,
            table.sortOrder,
        ),
    ],
);

export const liftingWorkout = createTable(
    'lifting_workout',
    {
        bodyweightKg: real('bodyweight_kg'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        endedAt: timestamp('ended_at', { withTimezone: true }),
        id: uuid('id').primaryKey().defaultRandom(),
        locationTag: varchar('location_tag', { length: 64 }),
        name: varchar('name', { length: 128 }),
        notes: text('notes'),
        programDayRef: jsonb('program_day_ref').$type<ProgramDayRef>(),
        routineId: uuid('routine_id'),
        rpeOverall: real('rpe_overall'),
        startedAt: timestamp('started_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        index('lifting_workout_user_started_idx').on(
            table.userId,
            table.startedAt.desc(),
        ),
        uniqueIndex('lifting_workout_user_active_idx')
            .on(table.userId)
            .where(sql`${table.endedAt} IS NULL`),
    ],
);

export const liftingWorkoutExercise = createTable(
    'lifting_workout_exercise',
    {
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => liftingExercise.id, { onDelete: 'restrict' }),
        id: uuid('id').primaryKey().defaultRandom(),
        notes: text('notes'),
        order: integer('order').notNull(),
        supersetGroup: integer('superset_group'),
        workoutId: uuid('workout_id')
            .notNull()
            .references(() => liftingWorkout.id, { onDelete: 'cascade' }),
    },
    (table) => [
        uniqueIndex('lifting_workout_exercise_workout_order_idx').on(
            table.workoutId,
            table.order,
        ),
        index('lifting_workout_exercise_exercise_idx').on(table.exerciseId),
    ],
);

export const liftingSet = createTable(
    'lifting_set',
    {
        completedAt: timestamp('completed_at', { withTimezone: true }),
        distanceM: real('distance_m'),
        durationS: integer('duration_s'),
        id: uuid('id').primaryKey().defaultRandom(),
        isPr: boolean('is_pr').notNull().default(false),
        notes: text('notes'),
        order: integer('order').notNull(),
        reps: integer('reps'),
        rir: real('rir'),
        rpe: real('rpe'),
        tempo: varchar('tempo', { length: 16 }),
        type: varchar('type', { length: 16 }).$type<SetType>().notNull(),
        weightKg: real('weight_kg'),
        workoutExerciseId: uuid('workout_exercise_id')
            .notNull()
            .references(() => liftingWorkoutExercise.id, {
                onDelete: 'cascade',
            }),
    },
    (table) => [
        uniqueIndex('lifting_set_workout_exercise_order_idx').on(
            table.workoutExerciseId,
            table.order,
        ),
    ],
);

export const liftingPersonalRecord = createTable(
    'lifting_personal_record',
    {
        achievedAt: timestamp('achieved_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => liftingExercise.id, { onDelete: 'cascade' }),
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: 24 }).$type<PrKind>().notNull(),
        reps: integer('reps').notNull(),
        setId: uuid('set_id'),
        userId: text('user_id').notNull(),
        valueNumeric: real('value_numeric').notNull(),
        weightKg: real('weight_kg').notNull(),
    },
    (table) => [
        index('lifting_pr_user_exercise_kind_idx').on(
            table.userId,
            table.exerciseId,
            table.kind,
            table.valueNumeric.desc(),
        ),
        index('lifting_pr_user_achieved_idx').on(
            table.userId,
            table.achievedAt.desc(),
        ),
    ],
);

export const liftingMeasurement = createTable(
    'lifting_measurement',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: 24 })
            .$type<MeasurementKind>()
            .notNull(),
        notes: text('notes'),
        takenAt: timestamp('taken_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        unit: varchar('unit', { length: 8 }).$type<MeasurementUnit>().notNull(),
        userId: text('user_id').notNull(),
        valueNumeric: real('value_numeric').notNull(),
    },
    (table) => [
        index('lifting_measurement_user_kind_taken_idx').on(
            table.userId,
            table.kind,
            table.takenAt.desc(),
        ),
    ],
);

export const liftingGoal = createTable(
    'lifting_goal',
    {
        achievedAt: timestamp('achieved_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        exerciseId: uuid('exercise_id'),
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: 24 }).$type<GoalKind>().notNull(),
        status: varchar('status', { length: 16 })
            .$type<GoalStatus>()
            .notNull()
            .default('active'),
        targetDate: varchar('target_date', { length: 10 }),
        targetValue: real('target_value').notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        index('lifting_goal_user_status_idx').on(table.userId, table.status),
    ],
);

export const liftingSettings = createTable('lifting_settings', {
    availablePlatesKg: jsonb('available_plates_kg')
        .$type<AvailablePlatesKg>()
        .notNull()
        .default([20, 15, 10, 5, 2.5, 1.25]),
    barWeightKg: real('bar_weight_kg').notNull().default(20),
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    defaultRestSeconds: integer('default_rest_seconds').notNull().default(120),
    unitDistance: varchar('unit_distance', { length: 4 })
        .$type<UnitDistance>()
        .notNull()
        .default('m'),
    unitLength: varchar('unit_length', { length: 4 })
        .$type<UnitLength>()
        .notNull()
        .default('cm'),
    unitWeight: varchar('unit_weight', { length: 4 })
        .$type<UnitWeight>()
        .notNull()
        .default('kg'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    userId: text('user_id').primaryKey(),
    weekStart: varchar('week_start', { length: 3 })
        .$type<WeekStart>()
        .notNull()
        .default('mon'),
});
