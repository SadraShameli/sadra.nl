import 'server-only';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';

import {
    goalInputSchema,
    idActionSchema,
    listGoalsInputSchema,
    updateGoalInputSchema,
} from '~/lib/lifting/schemas';
import { GOAL_STATUS } from '~/lib/lifting/types';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { liftingExercise, liftingGoal } from '~/server/db';

export const liftingGoalRouter = createTRPCRouter({
    create: protectedProcedure
        .input(goalInputSchema)
        .mutation(async ({ ctx, input }) => {
            const [row] = await ctx.db
                .insert(liftingGoal)
                .values({
                    exerciseId: input.exerciseId ?? null,
                    kind: input.kind,
                    targetDate: input.targetDate ?? null,
                    targetValue: input.targetValue,
                    userId: ctx.userId,
                })
                .returning({ id: liftingGoal.id });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create goal',
                });
            }
            return row;
        }),

    delete: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(liftingGoal)
                .where(
                    and(
                        eq(liftingGoal.id, input.id),
                        eq(liftingGoal.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),

    list: protectedProcedure
        .input(listGoalsInputSchema)
        .query(async ({ ctx, input }) => {
            const filters = [eq(liftingGoal.userId, ctx.userId)];
            if (input.status)
                filters.push(eq(liftingGoal.status, input.status));
            const rows = await ctx.db
                .select({
                    achievedAt: liftingGoal.achievedAt,
                    createdAt: liftingGoal.createdAt,
                    exerciseId: liftingGoal.exerciseId,
                    exerciseName: liftingExercise.name,
                    exerciseSlug: liftingExercise.slug,
                    id: liftingGoal.id,
                    kind: liftingGoal.kind,
                    status: liftingGoal.status,
                    targetDate: liftingGoal.targetDate,
                    targetValue: liftingGoal.targetValue,
                    userId: liftingGoal.userId,
                })
                .from(liftingGoal)
                .leftJoin(
                    liftingExercise,
                    eq(liftingExercise.id, liftingGoal.exerciseId),
                )
                .where(and(...filters))
                .orderBy(desc(liftingGoal.createdAt));
            return rows;
        }),

    markAchieved: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(liftingGoal)
                .set({ achievedAt: new Date(), status: GOAL_STATUS.ACHIEVED })
                .where(
                    and(
                        eq(liftingGoal.id, input.id),
                        eq(liftingGoal.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),

    update: protectedProcedure
        .input(updateGoalInputSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            await ctx.db
                .update(liftingGoal)
                .set({
                    exerciseId: rest.exerciseId ?? null,
                    kind: rest.kind,
                    status: rest.status,
                    targetDate: rest.targetDate ?? null,
                    targetValue: rest.targetValue,
                })
                .where(
                    and(
                        eq(liftingGoal.id, id),
                        eq(liftingGoal.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),
});
