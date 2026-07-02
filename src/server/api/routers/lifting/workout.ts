import 'server-only';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, isNull, lt, max, sql } from 'drizzle-orm';

import { rangeEnd } from '~/lib/lifting/date-range';
import {
    addExerciseToWorkoutInputSchema,
    idActionSchema,
    listWorkoutsInputSchema,
    reorderWorkoutExercisesInputSchema,
    startWorkoutInputSchema,
    updateWorkoutInputSchema,
} from '~/lib/lifting/schemas';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import {
    liftingExercise,
    liftingSet,
    liftingWorkout,
    liftingWorkoutExercise,
} from '~/server/db';
import {
    isUniqueViolation,
    retryOnUniqueViolation,
} from '~/server/helpers/pg-errors';

export const liftingWorkoutRouter = createTRPCRouter({
    addExercise: protectedProcedure
        .input(addExerciseToWorkoutInputSchema)
        .mutation(async ({ ctx, input }) => {
            const workout = await ctx.db.query.liftingWorkout.findFirst({
                where: (w, { and: a, eq: e }) =>
                    a(e(w.id, input.workoutId), e(w.userId, ctx.userId)),
            });
            if (!workout) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Workout not found',
                });
            }
            const row = await retryOnUniqueViolation(async () => {
                const [{ next } = { next: 0 }] = await ctx.db
                    .select({ next: max(liftingWorkoutExercise.order) })
                    .from(liftingWorkoutExercise)
                    .where(
                        eq(liftingWorkoutExercise.workoutId, input.workoutId),
                    );
                const [inserted] = await ctx.db
                    .insert(liftingWorkoutExercise)
                    .values({
                        exerciseId: input.exerciseId,
                        order: (next ?? 0) + 1,
                        supersetGroup: input.supersetGroup ?? null,
                        workoutId: input.workoutId,
                    })
                    .returning({ id: liftingWorkoutExercise.id });
                return inserted;
            });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not add exercise',
                });
            }
            return { id: row.id };
        }),

    delete: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(liftingWorkout)
                .where(
                    and(
                        eq(liftingWorkout.id, input.id),
                        eq(liftingWorkout.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),

    duplicate: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            const source = await ctx.db.query.liftingWorkout.findFirst({
                where: (w, { and: a, eq: e }) =>
                    a(e(w.id, input.id), e(w.userId, ctx.userId)),
                with: {
                    exercises: {
                        orderBy: (e, { asc: a }) => [a(e.order)],
                        with: {
                            sets: { orderBy: (s, { asc: a }) => [a(s.order)] },
                        },
                    },
                },
            });
            if (!source) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Workout not found',
                });
            }

            const [created] = await ctx.db
                .insert(liftingWorkout)
                .values({
                    name: source.name ?? null,
                    notes: source.notes,
                    userId: ctx.userId,
                })
                .returning({ id: liftingWorkout.id });
            if (!created) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not duplicate workout',
                });
            }

            if (source.exercises.length === 0) {
                return { id: created.id };
            }

            const insertedWex = await ctx.db
                .insert(liftingWorkoutExercise)
                .values(
                    source.exercises.map((ex) => ({
                        exerciseId: ex.exerciseId,
                        order: ex.order,
                        supersetGroup: ex.supersetGroup,
                        workoutId: created.id,
                    })),
                )
                .returning({
                    id: liftingWorkoutExercise.id,
                    order: liftingWorkoutExercise.order,
                });

            const idByOrder = new Map(insertedWex.map((w) => [w.order, w.id]));
            const setRows = source.exercises.flatMap((ex) => {
                const wexId = idByOrder.get(ex.order);
                if (!wexId || ex.sets.length === 0) return [];
                return ex.sets.map((s) => ({
                    notes: null,
                    order: s.order,
                    reps: s.reps,
                    type: s.type,
                    weightKg: s.weightKg,
                    workoutExerciseId: wexId,
                }));
            });
            if (setRows.length > 0) {
                const q = ctx.db.insert(liftingSet).values(setRows);
                await q;
            }

            return { id: created.id };
        }),

    end: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            const now = new Date();
            await ctx.db
                .update(liftingWorkout)
                .set({ endedAt: now, updatedAt: now })
                .where(
                    and(
                        eq(liftingWorkout.id, input.id),
                        eq(liftingWorkout.userId, ctx.userId),
                    ),
                );
            return { endedAt: now };
        }),

    get: protectedProcedure
        .input(idActionSchema)
        .query(async ({ ctx, input }) => {
            const row = await ctx.db.query.liftingWorkout.findFirst({
                where: (w, { and: a, eq: e }) =>
                    a(e(w.id, input.id), e(w.userId, ctx.userId)),
                with: {
                    exercises: {
                        orderBy: (e, { asc: a }) => [a(e.order)],
                        with: {
                            exercise: true,
                            sets: { orderBy: (s, { asc: a }) => [a(s.order)] },
                        },
                    },
                },
            });
            if (!row) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Workout not found',
                });
            }
            return row;
        }),

    getActive: protectedProcedure.query(async ({ ctx }) => {
        const row = await ctx.db.query.liftingWorkout.findFirst({
            where: (w, { and: a, eq: e, isNull: n }) =>
                a(e(w.userId, ctx.userId), n(w.endedAt)),
            with: {
                exercises: {
                    orderBy: (e, { asc: a }) => [a(e.order)],
                    with: {
                        exercise: true,
                        sets: { orderBy: (s, { asc: a }) => [a(s.order)] },
                    },
                },
            },
        });
        return row ?? null;
    }),

    list: protectedProcedure
        .input(listWorkoutsInputSchema)
        .query(async ({ ctx, input }) => {
            const filters = [eq(liftingWorkout.userId, ctx.userId)];
            if (input.from) {
                filters.push(gte(liftingWorkout.startedAt, input.from));
            }
            if (input.to)
                filters.push(lt(liftingWorkout.startedAt, rangeEnd(input.to)));
            return ctx.db
                .select()
                .from(liftingWorkout)
                .where(and(...filters))
                .orderBy(desc(liftingWorkout.startedAt))
                .limit(input.limit)
                .offset(input.offset);
        }),

    removeExercise: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
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
            await ctx.db
                .delete(liftingWorkoutExercise)
                .where(eq(liftingWorkoutExercise.id, input.id));
            return { ok: true };
        }),

    reorderExercises: protectedProcedure
        .input(reorderWorkoutExercisesInputSchema)
        .mutation(async ({ ctx, input }) => {
            const workout = await ctx.db.query.liftingWorkout.findFirst({
                where: (w, { and: a, eq: e }) =>
                    a(e(w.id, input.workoutId), e(w.userId, ctx.userId)),
            });
            if (!workout) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Workout not found',
                });
            }
            if (input.orderedIds.length === 0) return { ok: true };
            const negateChunks = input.orderedIds.map(
                (id, index) =>
                    sql`WHEN ${liftingWorkoutExercise.id} = ${id} THEN ${-(index + 1)}`,
            );
            const finalChunks = input.orderedIds.map(
                (id, index) =>
                    sql`WHEN ${liftingWorkoutExercise.id} = ${id} THEN ${index + 1}`,
            );
            const scope = and(
                eq(liftingWorkoutExercise.workoutId, input.workoutId),
                inArray(liftingWorkoutExercise.id, input.orderedIds),
            );
            await ctx.db
                .update(liftingWorkoutExercise)
                .set({
                    order: sql`CASE ${sql.join(negateChunks, sql.raw(' '))} END`,
                })
                .where(scope);
            await ctx.db
                .update(liftingWorkoutExercise)
                .set({
                    order: sql`CASE ${sql.join(finalChunks, sql.raw(' '))} END`,
                })
                .where(scope);
            return { ok: true };
        }),

    start: protectedProcedure
        .input(startWorkoutInputSchema)
        .mutation(async ({ ctx, input }) => {
            const active = await ctx.db
                .select({ id: liftingWorkout.id })
                .from(liftingWorkout)
                .where(
                    and(
                        eq(liftingWorkout.userId, ctx.userId),
                        isNull(liftingWorkout.endedAt),
                    ),
                )
                .limit(1);
            if (active[0]) return { id: active[0].id, resumed: true };

            let row: undefined | { id: string };
            try {
                [row] = await ctx.db
                    .insert(liftingWorkout)
                    .values({
                        name: input.name ?? null,
                        programDayRef: input.programDayRef ?? null,
                        routineId: input.routineId ?? null,
                        userId: ctx.userId,
                    })
                    .returning({ id: liftingWorkout.id });
            } catch (error) {
                if (!isUniqueViolation(error)) throw error;
                const [existing] = await ctx.db
                    .select({ id: liftingWorkout.id })
                    .from(liftingWorkout)
                    .where(
                        and(
                            eq(liftingWorkout.userId, ctx.userId),
                            isNull(liftingWorkout.endedAt),
                        ),
                    )
                    .limit(1);
                if (existing) return { id: existing.id, resumed: true };
                throw error;
            }
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not start workout',
                });
            }

            const routineId = input.routineId;
            if (routineId) {
                const routine = await ctx.db.query.liftingRoutine.findFirst({
                    where: (r, { and: a, eq: e }) =>
                        a(e(r.id, routineId), e(r.userId, ctx.userId)),
                });
                if (routine) {
                    const slugs = routine.blocks.map((b) => b.exerciseSlug);
                    const exercises =
                        slugs.length === 0
                            ? []
                            : await ctx.db
                                  .select({
                                      id: liftingExercise.id,
                                      slug: liftingExercise.slug,
                                  })
                                  .from(liftingExercise)
                                  .where(
                                      and(
                                          isNull(liftingExercise.ownerId),
                                          inArray(liftingExercise.slug, slugs),
                                      ),
                                  );
                    const bySlug = new Map(
                        exercises.map((e) => [e.slug, e.id]),
                    );
                    const wexRows = routine.blocks
                        .map((block, index) => {
                            const exId = bySlug.get(block.exerciseSlug);
                            return exId
                                ? {
                                      exerciseId: exId,
                                      order: index + 1,
                                      workoutId: row.id,
                                  }
                                : null;
                        })
                        .filter((r): r is NonNullable<typeof r> => r !== null);
                    if (wexRows.length > 0) {
                        const q = ctx.db
                            .insert(liftingWorkoutExercise)
                            .values(wexRows);
                        await q;
                    }
                }
            }

            return { id: row.id, resumed: false };
        }),

    update: protectedProcedure
        .input(updateWorkoutInputSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            await ctx.db
                .update(liftingWorkout)
                .set({ ...rest, updatedAt: new Date() })
                .where(
                    and(
                        eq(liftingWorkout.id, id),
                        eq(liftingWorkout.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),
});
