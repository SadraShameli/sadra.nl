import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import { LiftingCacheTag } from '~/lib/lifting/cacheTags';
import {
    db,
    liftingExercise,
    liftingExerciseAlias,
    liftingProgram,
} from '~/server/db';

export type ExerciseRow = typeof liftingExercise.$inferSelect;

export interface OfficialExerciseCatalog {
    readonly aliases: Record<string, string[]>;
    readonly rows: ExerciseRow[];
}

export type ProgramRow = typeof liftingProgram.$inferSelect;

export async function loadOfficialExercise(
    slug: string,
): Promise<ExerciseRow | null> {
    const { rows } = await loadOfficialExercises();
    return rows.find((row) => row.slug === slug) ?? null;
}

export async function loadOfficialExercises(): Promise<OfficialExerciseCatalog> {
    'use cache';
    cacheLife('days');
    cacheTag(LiftingCacheTag.OfficialExercises);
    const rows = await db
        .select()
        .from(liftingExercise)
        .where(isNull(liftingExercise.ownerId));
    const aliasRows = await db
        .select({
            alias: liftingExerciseAlias.alias,
            exerciseId: liftingExerciseAlias.exerciseId,
        })
        .from(liftingExerciseAlias);
    const aliases: Record<string, string[]> = {};
    for (const a of aliasRows) {
        const list = aliases[a.exerciseId] ?? [];
        list.push(a.alias.toLowerCase());
        aliases[a.exerciseId] = list;
    }
    return { aliases, rows };
}

export async function loadOfficialProgram(
    slug: string,
): Promise<null | ProgramRow> {
    const programs = await loadOfficialPrograms();
    return programs.find((program) => program.slug === slug) ?? null;
}

export async function loadOfficialPrograms(): Promise<ProgramRow[]> {
    'use cache';
    cacheLife('days');
    cacheTag(LiftingCacheTag.OfficialPrograms);
    return db
        .select()
        .from(liftingProgram)
        .where(
            and(
                eq(liftingProgram.isOfficial, true),
                isNull(liftingProgram.ownerId),
            ),
        )
        .orderBy(asc(liftingProgram.name));
}
