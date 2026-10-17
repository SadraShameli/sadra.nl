import { eq } from 'drizzle-orm';

import type { db } from '~/server/db';

import {
    liftingExercise,
    liftingGoal,
    liftingMeasurement,
    liftingPersonalRecord,
    liftingProgram,
    liftingRoutine,
    liftingSettings,
    liftingUserProgram,
    liftingWorkout,
} from '~/server/db/schemas/lifting';
import {
    dailyPreparations,
    tradeAssessments,
    tradingPlans,
} from '~/server/db/schemas/trading';

export async function deleteUserOwnedData(
    database: Pick<typeof db, 'transaction'>,
    userId: string,
): Promise<void> {
    await database.transaction(async (transaction) => {
        await transaction
            .delete(liftingWorkout)
            .where(eq(liftingWorkout.userId, userId));
        await transaction
            .delete(liftingPersonalRecord)
            .where(eq(liftingPersonalRecord.userId, userId));
        await transaction
            .delete(liftingGoal)
            .where(eq(liftingGoal.userId, userId));
        await transaction
            .delete(liftingMeasurement)
            .where(eq(liftingMeasurement.userId, userId));
        await transaction
            .delete(liftingRoutine)
            .where(eq(liftingRoutine.userId, userId));
        await transaction
            .delete(liftingSettings)
            .where(eq(liftingSettings.userId, userId));
        await transaction
            .delete(liftingUserProgram)
            .where(eq(liftingUserProgram.userId, userId));
        await transaction
            .delete(tradeAssessments)
            .where(eq(tradeAssessments.userId, userId));
        await transaction
            .delete(dailyPreparations)
            .where(eq(dailyPreparations.userId, userId));
        await transaction
            .delete(tradingPlans)
            .where(eq(tradingPlans.userId, userId));
        await transaction
            .delete(liftingProgram)
            .where(eq(liftingProgram.ownerId, userId));
        await transaction
            .delete(liftingExercise)
            .where(eq(liftingExercise.ownerId, userId));
    });
}
