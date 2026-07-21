import 'server-only';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';

import {
    customExerciseInputSchema,
    exerciseIdActionSchema,
    exerciseSlugActionSchema,
    listExercisesInputSchema,
    updateCustomExerciseInputSchema,
} from '~/lib/lifting/schemas';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { db, liftingExercise, liftingExerciseAlias } from '~/server/db';

type ExerciseRow = typeof liftingExercise.$inferSelect;

const loadOfficialExercises = async (): Promise<{
    aliases: Record<string, string[]>;
    rows: ExerciseRow[];
}> => {
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
};

function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replaceAll(/^-+|-+$/g, '')
        .slice(0, 96);
}

export const liftingExerciseRouter = createTRPCRouter({
    createCustom: protectedProcedure
        .input(customExerciseInputSchema)
        .mutation(async ({ ctx, input }) => {
            const slug = slugify(input.name) || crypto.randomUUID();
            const [inserted] = await ctx.db
                .insert(liftingExercise)
                .values({
                    defaultRestSeconds: input.defaultRestSeconds ?? null,
                    equipment: input.equipment,
                    force: input.force,
                    imageUrl: input.imageUrl ?? null,
                    instructions: input.instructions ?? null,
                    isCustom: true,
                    mechanic: input.mechanic,
                    name: input.name,
                    ownerId: ctx.userId,
                    primaryMuscle: input.primaryMuscle,
                    secondaryMuscles: input.secondaryMuscles,
                    slug,
                    tags: input.tags,
                    videoUrl: input.videoUrl ?? null,
                })
                .returning({
                    id: liftingExercise.id,
                    slug: liftingExercise.slug,
                });
            if (!inserted) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create exercise',
                });
            }
            return inserted;
        }),

    deleteCustom: protectedProcedure
        .input(exerciseIdActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(liftingExercise)
                .where(
                    and(
                        eq(liftingExercise.id, input.id),
                        eq(liftingExercise.ownerId, ctx.userId),
                        eq(liftingExercise.isCustom, true),
                    ),
                );
            return { ok: true };
        }),

    get: protectedProcedure
        .input(exerciseSlugActionSchema)
        .query(async ({ ctx, input }) => {
            const row = await ctx.db.query.liftingExercise.findFirst({
                where: (fields, { and: a, eq: equals, isNull: n, or: o }) =>
                    a(
                        equals(fields.slug, input.slug),
                        o(
                            n(fields.ownerId),
                            equals(fields.ownerId, ctx.userId),
                        ),
                    ),
            });
            if (!row) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Exercise not found',
                });
            }
            return row;
        }),

    list: protectedProcedure
        .input(listExercisesInputSchema)
        .query(async ({ ctx, input }) => {
            const { aliases, rows: officialRows } =
                await loadOfficialExercises();
            const customRows: ExerciseRow[] = input.includeCustom
                ? await ctx.db
                      .select()
                      .from(liftingExercise)
                      .where(eq(liftingExercise.ownerId, ctx.userId))
                : [];

            const merged: ExerciseRow[] = [...officialRows, ...customRows];
            const term = input.search?.trim().toLowerCase();
            const filtered = merged.filter((row) => {
                if (input.muscle && row.primaryMuscle !== input.muscle)
                    return false;
                if (input.equipment && row.equipment !== input.equipment)
                    return false;
                if (term && term.length > 0) {
                    const isNameHit = row.name.toLowerCase().includes(term);
                    const isAliasHit = (aliases[row.id] ?? []).some((a) =>
                        a.includes(term),
                    );
                    if (!isNameHit && !isAliasHit) return false;
                }
                return true;
            });

            filtered.sort((a, b) => {
                if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            return filtered.slice(input.offset, input.offset + input.limit);
        }),

    updateCustom: protectedProcedure
        .input(updateCustomExerciseInputSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            await ctx.db
                .update(liftingExercise)
                .set({
                    defaultRestSeconds: rest.defaultRestSeconds ?? null,
                    equipment: rest.equipment,
                    force: rest.force,
                    imageUrl: rest.imageUrl ?? null,
                    instructions: rest.instructions ?? null,
                    mechanic: rest.mechanic,
                    name: rest.name,
                    primaryMuscle: rest.primaryMuscle,
                    secondaryMuscles: rest.secondaryMuscles,
                    tags: rest.tags,
                    updatedAt: new Date(),
                    videoUrl: rest.videoUrl ?? null,
                })
                .where(
                    and(
                        eq(liftingExercise.id, id),
                        eq(liftingExercise.ownerId, ctx.userId),
                        eq(liftingExercise.isCustom, true),
                    ),
                );
            return { ok: true };
        }),
});
