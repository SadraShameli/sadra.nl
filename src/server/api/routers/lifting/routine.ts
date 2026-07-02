import 'server-only';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import {
    createRoutineInputSchema,
    idActionSchema,
    reorderRoutinesInputSchema,
    updateRoutineInputSchema,
} from '~/lib/lifting/schemas';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { liftingRoutine } from '~/server/db';

export const liftingRoutineRouter = createTRPCRouter({
    create: protectedProcedure
        .input(createRoutineInputSchema)
        .mutation(async ({ ctx, input }) => {
            const [row] = await ctx.db
                .insert(liftingRoutine)
                .values({
                    blocks: input.blocks,
                    name: input.name,
                    userId: ctx.userId,
                })
                .returning({ id: liftingRoutine.id });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create routine',
                });
            }
            return row;
        }),

    delete: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(liftingRoutine)
                .where(
                    and(
                        eq(liftingRoutine.id, input.id),
                        eq(liftingRoutine.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),

    list: protectedProcedure.query(async ({ ctx }) => {
        return ctx.db
            .select()
            .from(liftingRoutine)
            .where(eq(liftingRoutine.userId, ctx.userId))
            .orderBy(asc(liftingRoutine.sortOrder), asc(liftingRoutine.name));
    }),

    reorder: protectedProcedure
        .input(reorderRoutinesInputSchema)
        .mutation(async ({ ctx, input }) => {
            if (input.orderedIds.length === 0) return { ok: true };
            const caseChunks = input.orderedIds.map(
                (id, index) =>
                    sql`WHEN ${liftingRoutine.id} = ${id} THEN ${index}`,
            );
            await ctx.db
                .update(liftingRoutine)
                .set({
                    sortOrder: sql`CASE ${sql.join(caseChunks, sql.raw(' '))} END`,
                })
                .where(
                    and(
                        eq(liftingRoutine.userId, ctx.userId),
                        inArray(liftingRoutine.id, input.orderedIds),
                    ),
                );
            return { ok: true };
        }),

    update: protectedProcedure
        .input(updateRoutineInputSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, sortOrder, ...rest } = input;
            await ctx.db
                .update(liftingRoutine)
                .set({
                    ...rest,
                    sortOrder: sortOrder ?? undefined,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(liftingRoutine.id, id),
                        eq(liftingRoutine.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),
});
