import 'server-only';
import { TRPCError } from '@trpc/server';
import { eq, max } from 'drizzle-orm';

import {
    completeSetInputSchema,
    createSetInputSchema,
    idActionSchema,
    updateSetInputSchema,
} from '~/lib/lifting/schemas';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { liftingSet } from '~/server/db';
import { retryOnUniqueViolation } from '~/server/helpers/pg-errors';

import { PrSyncService } from './pr-sync';

export const liftingSetRouter = createTRPCRouter({
    complete: protectedProcedure
        .input(completeSetInputSchema)
        .mutation(async ({ ctx, input }) => {
            const sync = new PrSyncService(ctx.db);
            const set = await ctx.db.query.liftingSet.findFirst({
                where: (s, { eq: e }) => e(s.id, input.id),
            });
            if (!set) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Set not found',
                });
            }
            const exerciseId = await sync.resolveExerciseId(
                ctx.userId,
                set.workoutExerciseId,
            );
            if (!exerciseId) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Set does not belong to current user',
                });
            }
            await ctx.db
                .update(liftingSet)
                .set({ completedAt: input.completedAt ?? new Date() })
                .where(eq(liftingSet.id, input.id));
            await sync.syncExercise(ctx.userId, exerciseId);
            return { ok: true };
        }),

    create: protectedProcedure
        .input(createSetInputSchema)
        .mutation(async ({ ctx, input }) => {
            const sync = new PrSyncService(ctx.db);
            const exerciseId = await sync.resolveExerciseId(
                ctx.userId,
                input.workoutExerciseId,
            );
            if (!exerciseId) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Workout exercise does not belong to current user',
                });
            }
            const row = await retryOnUniqueViolation(async () => {
                const [{ next } = { next: 0 }] = await ctx.db
                    .select({ next: max(liftingSet.order) })
                    .from(liftingSet)
                    .where(
                        eq(
                            liftingSet.workoutExerciseId,
                            input.workoutExerciseId,
                        ),
                    );
                const [inserted] = await ctx.db
                    .insert(liftingSet)
                    .values({
                        completedAt: new Date(),
                        distanceM: input.distanceM ?? null,
                        durationS: input.durationS ?? null,
                        notes: input.notes ?? null,
                        order: (next ?? 0) + 1,
                        reps: input.reps ?? null,
                        rir: input.rir ?? null,
                        rpe: input.rpe ?? null,
                        tempo: input.tempo ?? null,
                        type: input.type,
                        weightKg: input.weightKg ?? null,
                        workoutExerciseId: input.workoutExerciseId,
                    })
                    .returning({ id: liftingSet.id });
                return inserted;
            });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create set',
                });
            }
            await sync.syncExercise(ctx.userId, exerciseId);
            return { id: row.id };
        }),

    delete: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            const sync = new PrSyncService(ctx.db);
            const set = await ctx.db.query.liftingSet.findFirst({
                where: (s, { eq: e }) => e(s.id, input.id),
                with: {
                    workoutExercise: { with: { workout: true } },
                },
            });
            if (!set) return { ok: true };
            if (set.workoutExercise.workout.userId !== ctx.userId) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Set does not belong to current user',
                });
            }
            const exerciseId = set.workoutExercise.exerciseId;
            await ctx.db.delete(liftingSet).where(eq(liftingSet.id, input.id));
            await sync.syncExercise(ctx.userId, exerciseId);
            return { ok: true };
        }),

    listByWorkoutExercise: protectedProcedure
        .input(idActionSchema)
        .query(async ({ ctx, input }) => {
            const wex = await ctx.db.query.liftingWorkoutExercise.findFirst({
                where: (w, { eq: e }) => e(w.id, input.id),
                with: { workout: true },
            });
            if (wex?.workout.userId !== ctx.userId) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Workout exercise not found',
                });
            }
            return ctx.db
                .select()
                .from(liftingSet)
                .where(eq(liftingSet.workoutExerciseId, input.id))
                .orderBy(liftingSet.order);
        }),

    update: protectedProcedure
        .input(updateSetInputSchema)
        .mutation(async ({ ctx, input }) => {
            const sync = new PrSyncService(ctx.db);
            const set = await ctx.db.query.liftingSet.findFirst({
                where: (s, { eq: e }) => e(s.id, input.id),
                with: {
                    workoutExercise: { with: { workout: true } },
                },
            });
            if (!set) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Set not found',
                });
            }
            if (set.workoutExercise.workout.userId !== ctx.userId) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Set does not belong to current user',
                });
            }
            const { id, ...rest } = input;
            await ctx.db
                .update(liftingSet)
                .set({
                    distanceM: rest.distanceM ?? null,
                    durationS: rest.durationS ?? null,
                    notes: rest.notes ?? null,
                    reps: rest.reps ?? null,
                    rir: rest.rir ?? null,
                    rpe: rest.rpe ?? null,
                    tempo: rest.tempo ?? null,
                    type: rest.type,
                    weightKg: rest.weightKg ?? null,
                })
                .where(eq(liftingSet.id, id));

            await sync.syncExercise(ctx.userId, set.workoutExercise.exerciseId);
            return { ok: true };
        }),
});
