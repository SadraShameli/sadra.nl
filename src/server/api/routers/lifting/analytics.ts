import 'server-only';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';

import type { WeekStart } from '~/lib/lifting/types';
import type { db as Database } from '~/server/db';

import { rangeEnd } from '~/lib/lifting/date-range';
import { oneRepMaxCalculator } from '~/lib/lifting/math/one-rep-max';
import { StreakAnalyzer } from '~/lib/lifting/math/streak';
import { VolumeAnalyzer, type VolumeSet } from '~/lib/lifting/math/volume';
import {
    consistencyInputSchema,
    dateRangeInputSchema,
    exerciseRangeInputSchema,
    idActionSchema,
} from '~/lib/lifting/schemas';
import { WEEK_START_VALUES } from '~/lib/lifting/types';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import {
    liftingExercise,
    liftingPersonalRecord,
    liftingSet,
    liftingWorkout,
    liftingWorkoutExercise,
} from '~/server/db';

async function getUserWeekStart(context: {
    db: typeof Database;
    userId: string;
}): Promise<WeekStart> {
    const settings = await context.db.query.liftingSettings.findFirst({
        columns: { weekStart: true },
        where: (s, { eq: equals }) => equals(s.userId, context.userId),
    });
    const raw = settings?.weekStart ?? 'mon';
    return (WEEK_START_VALUES as readonly string[]).includes(raw) ? raw : 'mon';
}

export const liftingAnalyticsRouter = createTRPCRouter({
    consistency: protectedProcedure
        .input(consistencyInputSchema)
        .query(async ({ ctx, input }) => {
            const workouts = await ctx.db
                .select({ startedAt: liftingWorkout.startedAt })
                .from(liftingWorkout)
                .where(eq(liftingWorkout.userId, ctx.userId))
                .orderBy(desc(liftingWorkout.startedAt));
            const dates = workouts.map((w) => w.startedAt);
            const weekStart = await getUserWeekStart(ctx);
            const analyzer = new StreakAnalyzer(weekStart);
            return {
                currentStreak: analyzer.currentStreak(dates),
                longestStreak: analyzer.longestStreak(dates),
                sessionsPerWeek: analyzer.sessionsPerWeek(
                    dates,
                    input.trailingWeeks,
                ),
            };
        }),

    e1rmTrend: protectedProcedure
        .input(exerciseRangeInputSchema)
        .query(async ({ ctx, input }) => {
            const toExclusive = input.to ? rangeEnd(input.to) : undefined;
            const rows = await ctx.db
                .select({
                    reps: liftingSet.reps,
                    startedAt: liftingWorkout.startedAt,
                    weightKg: liftingSet.weightKg,
                })
                .from(liftingSet)
                .innerJoin(
                    liftingWorkoutExercise,
                    eq(liftingWorkoutExercise.id, liftingSet.workoutExerciseId),
                )
                .innerJoin(
                    liftingWorkout,
                    eq(liftingWorkout.id, liftingWorkoutExercise.workoutId),
                )
                .where(
                    and(
                        eq(liftingWorkout.userId, ctx.userId),
                        eq(liftingWorkoutExercise.exerciseId, input.exerciseId),
                        ...(input.from
                            ? [gte(liftingWorkout.startedAt, input.from)]
                            : []),
                        ...(toExclusive
                            ? [lt(liftingWorkout.startedAt, toExclusive)]
                            : []),
                    ),
                )
                .orderBy(asc(liftingWorkout.startedAt));

            const bySession = new Map<string, number>();
            for (const row of rows) {
                if (row.weightKg === null || row.reps === null) continue;
                const oneRepMax = oneRepMaxCalculator.estimate(
                    row.weightKg,
                    row.reps,
                );
                if (oneRepMax <= 0) continue;
                const dayKey = row.startedAt.toISOString().slice(0, 10);
                const previous = bySession.get(dayKey) ?? 0;
                if (oneRepMax > previous) bySession.set(dayKey, oneRepMax);
            }
            return [...bySession]
                .map(([date, oneRepMax]) => ({ date, e1rm: oneRepMax }))
                .toSorted((a, b) => a.date.localeCompare(b.date));
        }),

    frequencyHeatmap: protectedProcedure
        .input(dateRangeInputSchema)
        .query(async ({ ctx, input }) => {
            const toExclusive = rangeEnd(input.to);
            const rows = await ctx.db
                .select({
                    reps: liftingSet.reps,
                    startedAt: liftingWorkout.startedAt,
                    weightKg: liftingSet.weightKg,
                })
                .from(liftingSet)
                .innerJoin(
                    liftingWorkoutExercise,
                    eq(liftingWorkoutExercise.id, liftingSet.workoutExerciseId),
                )
                .innerJoin(
                    liftingWorkout,
                    eq(liftingWorkout.id, liftingWorkoutExercise.workoutId),
                )
                .where(
                    and(
                        eq(liftingWorkout.userId, ctx.userId),
                        gte(liftingWorkout.startedAt, input.from),
                        lt(liftingWorkout.startedAt, toExclusive),
                    ),
                );
            const byDate = new Map<string, number>();
            for (const r of rows) {
                if (r.weightKg === null || r.reps === null) continue;
                const dayKey = r.startedAt.toISOString().slice(0, 10);
                byDate.set(
                    dayKey,
                    (byDate.get(dayKey) ?? 0) + r.weightKg * r.reps,
                );
            }
            return [...byDate].map(([date, tonnageKg]) => ({
                date,
                tonnageKg,
            }));
        }),

    prTimeline: protectedProcedure
        .input(idActionSchema)
        .query(async ({ ctx, input }) => {
            return ctx.db
                .select()
                .from(liftingPersonalRecord)
                .where(
                    and(
                        eq(liftingPersonalRecord.userId, ctx.userId),
                        eq(liftingPersonalRecord.exerciseId, input.id),
                    ),
                )
                .orderBy(desc(liftingPersonalRecord.achievedAt));
        }),

    summaryHero: protectedProcedure.query(async ({ ctx }) => {
        const workouts = await ctx.db
            .select({
                endedAt: liftingWorkout.endedAt,
                id: liftingWorkout.id,
                name: liftingWorkout.name,
                startedAt: liftingWorkout.startedAt,
            })
            .from(liftingWorkout)
            .where(eq(liftingWorkout.userId, ctx.userId))
            .orderBy(desc(liftingWorkout.startedAt))
            .limit(20);
        const recentPrs = await ctx.db
            .select()
            .from(liftingPersonalRecord)
            .where(eq(liftingPersonalRecord.userId, ctx.userId))
            .orderBy(desc(liftingPersonalRecord.achievedAt))
            .limit(3);
        const weekStart = await getUserWeekStart(ctx);
        const analyzer = new StreakAnalyzer(weekStart);
        const dates = workouts.map((w) => w.startedAt);
        return {
            currentStreak: analyzer.currentStreak(dates),
            lastWorkout: workouts[0] ?? null,
            recentPrs,
            sessionsThisWeek: analyzer.sessionsPerWeek(dates, 1),
        };
    }),

    volumePerMuscle: protectedProcedure
        .input(dateRangeInputSchema)
        .query(async ({ ctx, input }) => {
            const toExclusive = rangeEnd(input.to);
            const rows = await ctx.db
                .select({
                    primaryMuscle: liftingExercise.primaryMuscle,
                    reps: liftingSet.reps,
                    secondaryMuscles: liftingExercise.secondaryMuscles,
                    type: liftingSet.type,
                    weightKg: liftingSet.weightKg,
                })
                .from(liftingSet)
                .innerJoin(
                    liftingWorkoutExercise,
                    eq(liftingWorkoutExercise.id, liftingSet.workoutExerciseId),
                )
                .innerJoin(
                    liftingExercise,
                    eq(liftingExercise.id, liftingWorkoutExercise.exerciseId),
                )
                .innerJoin(
                    liftingWorkout,
                    eq(liftingWorkout.id, liftingWorkoutExercise.workoutId),
                )
                .where(
                    and(
                        eq(liftingWorkout.userId, ctx.userId),
                        gte(liftingWorkout.startedAt, input.from),
                        lt(liftingWorkout.startedAt, toExclusive),
                    ),
                );

            const sets: VolumeSet[] = rows.map((r) => ({
                primaryMuscle: r.primaryMuscle,
                reps: r.reps,
                secondaryMuscles: r.secondaryMuscles,
                type: r.type,
                weightKg: r.weightKg,
            }));
            const analyzer = new VolumeAnalyzer();
            return {
                setsByRepRange: analyzer.setsByRepRange(sets),
                setsPerMuscle: analyzer.setsPerMuscle(sets),
                tonnageKg: analyzer.tonnage(sets),
            };
        }),
});
