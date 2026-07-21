export const EQUIPMENT_VALUES = [
    'barbell',
    'dumbbell',
    'machine',
    'cable',
    'bodyweight',
    'kettlebell',
    'band',
    'cardio',
    'other',
] as const;

export const MECHANIC_VALUES = ['compound', 'isolation'] as const;

export const FORCE_VALUES = [
    'push',
    'pull',
    'static',
    'hinge',
    'squat',
    'carry',
] as const;

export const MUSCLE_VALUES = [
    'chest',
    'back',
    'shoulders',
    'biceps',
    'triceps',
    'quads',
    'hamstrings',
    'glutes',
    'calves',
    'abs',
    'forearms',
    'traps',
    'lats',
] as const;

export const SET_TYPE_VALUES = [
    'warmup',
    'working',
    'dropset',
    'amrap',
    'failure',
    'backoff',
    'topset',
] as const;

export const PR_KIND_VALUES = [
    'estimated_1rm',
    'heaviest_weight',
    'reps_at_weight',
    'best_volume_set',
] as const;

export const MEASUREMENT_KIND_VALUES = [
    'weight',
    'bodyfat',
    'waist',
    'chest',
    'arm_l',
    'arm_r',
    'thigh_l',
    'thigh_r',
    'calf_l',
    'calf_r',
    'neck',
    'hip',
] as const;

export const GOAL_KIND_VALUES = [
    'onerepmax',
    'rep_pr',
    'bodyweight',
    'weekly_frequency',
    'streak',
    'volume',
] as const;

export const GOAL_STATUS_VALUES = [
    'active',
    'achieved',
    'failed',
    'paused',
] as const;

export const USER_PROGRAM_STATUS_VALUES = [
    'active',
    'paused',
    'completed',
] as const;

export const PROGRAM_CATEGORY_VALUES = [
    'strength',
    'hypertrophy',
    'powerlifting',
    'general',
    'beginner',
] as const;

export const UNIT_WEIGHT_VALUES = ['kg', 'lb'] as const;
export const UNIT_DISTANCE_VALUES = ['m', 'mi'] as const;
export const UNIT_LENGTH_VALUES = ['cm', 'in'] as const;
export const WEEK_START_VALUES = ['mon', 'sun'] as const;
export const MEASUREMENT_UNIT_VALUES = ['kg', 'lb', '%', 'cm', 'in'] as const;

export const PROGRAM_BLOCK_KIND_VALUES = [
    'straight',
    'topset_backoff',
    'pyramid',
    'amrap',
    'emom',
    'superset',
] as const;

export const PROGRESSION_RULE_VALUES = [
    'linear',
    'double',
    'percentage',
    'rpe_target',
] as const;

export interface AmrapBlock {
    exerciseSlug: string;
    kind: 'amrap';
    pct1rm?: number;
    restSeconds?: number;
    targetReps?: number;
}
export type AvailablePlatesKg = readonly number[];
export interface EmomBlock {
    exerciseSlug: string;
    kind: 'emom';
    minutes: number;
    repsPerMinute: number;
    restSeconds?: number;
}
export type Equipment = (typeof EQUIPMENT_VALUES)[number];
export type ForceVector = (typeof FORCE_VALUES)[number];
export type GoalKind = (typeof GOAL_KIND_VALUES)[number];
export type GoalStatus = (typeof GOAL_STATUS_VALUES)[number];
export type MeasurementKind = (typeof MEASUREMENT_KIND_VALUES)[number];
export type MeasurementUnit = (typeof MEASUREMENT_UNIT_VALUES)[number];
export type Mechanic = (typeof MECHANIC_VALUES)[number];
export type MuscleGroup = (typeof MUSCLE_VALUES)[number];
export type OneRepMaxMap = Record<string, number>;
export type PrKind = (typeof PR_KIND_VALUES)[number];
export type ProgramBlock =
    | AmrapBlock
    | EmomBlock
    | PyramidBlock
    | StraightBlock
    | SupersetBlock
    | TopsetBackoffBlock;
export type ProgramBlockKind = (typeof PROGRAM_BLOCK_KIND_VALUES)[number];
export type ProgramCategory = (typeof PROGRAM_CATEGORY_VALUES)[number];
export interface ProgramDay {
    blocks: ProgramBlock[];
    isDeload?: boolean;
    name: string;
}

export interface ProgramDayReference {
    day: number;
    userProgramId: string;
    week: number;
}

export interface ProgramSchedule {
    weeks: ProgramWeek[];
}

export interface ProgramWeek {
    days: ProgramDay[];
    name?: string;
}

export type ProgressionRuleKind = (typeof PROGRESSION_RULE_VALUES)[number];

export interface PyramidBlock {
    exerciseSlug: string;
    kind: 'pyramid';
    restSeconds?: number;
    setSchemes: Array<{ pct1rm?: number; reps: number; rpe?: number }>;
}

export interface RoutineBlock {
    exerciseSlug: string;
    notes?: string;
    restSeconds?: number;
    sets: number;
    targetReps?: number;
    targetRpe?: number;
}

export type SetType = (typeof SET_TYPE_VALUES)[number];

export interface StraightBlock {
    exerciseSlug: string;
    kind: 'straight';
    pct1rm?: number;
    reps: number | string;
    restSeconds?: number;
    rpe?: number;
    sets: number;
}

export interface SupersetBlock {
    group: ProgramBlock[];
    kind: 'superset';
    restSeconds?: number;
}

export interface TopsetBackoffBlock {
    backoffPct: number;
    backoffSets: number;
    exerciseSlug: string;
    kind: 'topset_backoff';
    reps: number;
    restSeconds?: number;
    topPct: number;
}

export type UnitDistance = (typeof UNIT_DISTANCE_VALUES)[number];

export type UnitLength = (typeof UNIT_LENGTH_VALUES)[number];

export type UnitWeight = (typeof UNIT_WEIGHT_VALUES)[number];

export type UserProgramStatus = (typeof USER_PROGRAM_STATUS_VALUES)[number];
export type WeekStart = (typeof WEEK_START_VALUES)[number];

export const USER_PROGRAM_STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    PAUSED: 'paused',
} as const satisfies Record<string, UserProgramStatus>;

export const GOAL_STATUS = {
    ACHIEVED: 'achieved',
    ACTIVE: 'active',
    FAILED: 'failed',
    PAUSED: 'paused',
} as const satisfies Record<string, GoalStatus>;
