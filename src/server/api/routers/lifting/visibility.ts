import 'server-only';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';

import type { db as DatabaseType } from '~/server/db';

import { liftingExercise, liftingProgram } from '~/server/db';

export async function assertExerciseVisible(
    database: typeof DatabaseType,
    userId: string,
    exerciseId: string,
): Promise<void> {
    const row = await database.query.liftingExercise.findFirst({
        columns: { id: true },
        where: and(
            eq(liftingExercise.id, exerciseId),
            exerciseVisibleTo(userId),
        ),
    });
    if (!row) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Exercise not found',
        });
    }
}

export function exerciseVisibleTo(userId: string): SQL | undefined {
    return or(
        isNull(liftingExercise.ownerId),
        eq(liftingExercise.ownerId, userId),
    );
}

export function programVisibleTo(userId: string): SQL | undefined {
    return or(
        isNull(liftingProgram.ownerId),
        eq(liftingProgram.ownerId, userId),
    );
}
