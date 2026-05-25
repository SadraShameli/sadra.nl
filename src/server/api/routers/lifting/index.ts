import { createTRPCRouter } from '~/server/api/trpc';

import { liftingAnalyticsRouter } from './analytics';
import { liftingExerciseRouter } from './exercise';
import { liftingGoalRouter } from './goal';
import { liftingMeasurementRouter } from './measurement';
import { liftingProgramRouter } from './program';
import { liftingRoutineRouter } from './routine';
import { liftingSetRouter } from './set';
import { liftingSettingsRouter } from './settings';
import { liftingWorkoutRouter } from './workout';

export const liftingRouter = createTRPCRouter({
    analytics: liftingAnalyticsRouter,
    exercise: liftingExerciseRouter,
    goal: liftingGoalRouter,
    measurement: liftingMeasurementRouter,
    program: liftingProgramRouter,
    routine: liftingRoutineRouter,
    set: liftingSetRouter,
    settings: liftingSettingsRouter,
    workout: liftingWorkoutRouter,
});
