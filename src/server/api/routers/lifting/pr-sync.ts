import { and, asc, eq, inArray } from 'drizzle-orm';
import 'server-only';

import type { PrKind } from '~/lib/lifting/types';
import type { db as DatabaseType } from '~/server/db';

import { PrDetectionPipeline, type PrSet } from '~/lib/lifting/pr-detection';
import {
    liftingPersonalRecord,
    liftingSet,
    liftingWorkout,
    liftingWorkoutExercise,
} from '~/server/db';

export class PrSyncService {
    private readonly pipeline = new PrDetectionPipeline();

    constructor(private readonly database: typeof DatabaseType) {}

    private static isWorkingType(type: string): boolean {
        return ['amrap', 'backoff', 'failure', 'topset', 'working'].includes(
            type,
        );
    }

    async resolveExerciseId(
        userId: string,
        workoutExerciseId: string,
    ): Promise<null | string> {
        const row = await this.database.query.liftingWorkoutExercise.findFirst({
            where: (w, { eq: e }) => e(w.id, workoutExerciseId),
            with: { workout: true },
        });
        if (!row) return null;
        if (row.workout.userId !== userId) return null;
        return row.exerciseId;
    }

    async syncExercise(userId: string, exerciseId: string): Promise<void> {
        const setsQuery = await this.database
            .select({
                completedAt: liftingSet.completedAt,
                id: liftingSet.id,
                reps: liftingSet.reps,
                startedAt: liftingWorkout.startedAt,
                type: liftingSet.type,
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
                    eq(liftingWorkout.userId, userId),
                    eq(liftingWorkoutExercise.exerciseId, exerciseId),
                ),
            )
            .orderBy(
                asc(liftingSet.completedAt),
                asc(liftingWorkout.startedAt),
            );

        const ordered: PrSet[] = setsQuery
            .filter(
                (r): r is typeof r & { reps: number; weightKg: number } =>
                    r.weightKg !== null &&
                    r.reps !== null &&
                    PrSyncService.isWorkingType(r.type),
            )
            .map((r) => ({
                completedAt: r.completedAt ?? r.startedAt,
                id: r.id,
                reps: r.reps,
                weightKg: r.weightKg,
            }));

        const history: PrSet[] = [];
        const prRows: Array<{
            achievedAt: Date;
            exerciseId: string;
            kind: PrKind;
            reps: number;
            setId: string;
            userId: string;
            valueNumeric: number;
            weightKg: number;
        }> = [];
        const prSetIds = new Set<string>();

        for (const set of ordered) {
            const unlocked = this.pipeline.run(history, set);
            for (const u of unlocked) {
                prRows.push({
                    achievedAt: u.achievedAt,
                    exerciseId,
                    kind: u.kind,
                    reps: u.reps,
                    setId: u.setId,
                    userId,
                    valueNumeric: u.valueNumeric,
                    weightKg: u.weightKg,
                });
                prSetIds.add(u.setId);
            }
            history.push(set);
        }

        await this.database
            .delete(liftingPersonalRecord)
            .where(
                and(
                    eq(liftingPersonalRecord.userId, userId),
                    eq(liftingPersonalRecord.exerciseId, exerciseId),
                ),
            );

        if (prRows.length > 0) {
            const q = this.database
                .insert(liftingPersonalRecord)
                .values(prRows);
            await q;
        }

        const allIds = ordered.map((s) => s.id);
        if (allIds.length > 0) {
            await this.database
                .update(liftingSet)
                .set({ isPr: false })
                .where(inArray(liftingSet.id, allIds));
        }
        if (prSetIds.size > 0) {
            await this.database
                .update(liftingSet)
                .set({ isPr: true })
                .where(inArray(liftingSet.id, [...prSetIds]));
        }
    }
}
