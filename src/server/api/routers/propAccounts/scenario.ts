import { and, eq, inArray } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    PROP_QUOTA_LIMITS,
    PropAccountRepo,
    PropQuotaGuard,
} from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    PropQuota,
    PropRecord,
    propSavedScenarioOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import { entityIdSchema, scenarioSaveSchema } from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propSavedScenario } from '~/server/db/schemas/prop';

import {
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Scenario);

const scenarioImportManySchema = z
    .array(scenarioSaveSchema)
    .min(1)
    .max(PROP_QUOTA_LIMITS[PropQuota.Scenarios])
    .superRefine((scenarios, context) => {
        const seen = new Set<string>();
        for (const [index, scenario] of scenarios.entries()) {
            if (seen.has(scenario.name)) {
                context.addIssue({
                    code: 'custom',
                    message: 'one import holds each scenario name only once',
                    path: [index, 'name'],
                });
            }
            seen.add(scenario.name);
        }
    });

const scenarioImportOutputSchema = z.object({
    imported: z.array(propSavedScenarioOutputSchema),
    skippedNames: z.array(z.string()),
});

const scenarioRemoveAllOutputSchema = z.object({
    removed: z.number().int().nonnegative(),
});

export const propScenarioRouter = createTRPCRouter({
    importMany: mutation
        .input(scenarioImportManySchema)
        .output(scenarioImportOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const names = input.map((scenario) => scenario.name);
                const stored = await tx
                    .select({ name: propSavedScenario.name })
                    .from(propSavedScenario)
                    .where(
                        and(
                            eq(propSavedScenario.userId, ctx.userId),
                            inArray(propSavedScenario.name, names),
                        ),
                    )
                    .limit(input.length);
                const storedNames = new Set(stored.map((row) => row.name));
                const fresh = input.filter(
                    (scenario) => !storedNames.has(scenario.name),
                );
                if (fresh.length === 0) {
                    return { imported: [], skippedNames: names };
                }
                await quotas.assertWithin(PropQuota.Scenarios, fresh.length);
                const imported = await tx
                    .insert(propSavedScenario)
                    .values(
                        fresh.map((scenario) => ({
                            ...scenario,
                            userId: ctx.userId,
                        })),
                    )
                    .onConflictDoNothing({
                        target: [propSavedScenario.userId, propSavedScenario.name],
                    })
                    .returning();
                const importedNames = new Set(imported.map((row) => row.name));
                return {
                    imported,
                    skippedNames: input
                        .filter((scenario) => !importedNames.has(scenario.name))
                        .map((scenario) => scenario.name),
                };
            }),
        ),

    list: propProcedure
        .output(z.array(propSavedScenarioOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listScenarios(),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const scenario = await repo.loadOwnedScenarioOrThrow(input.id);
                await tx
                    .delete(propSavedScenario)
                    .where(
                        and(
                            eq(propSavedScenario.id, scenario.id),
                            eq(propSavedScenario.userId, ctx.userId),
                        ),
                    );
                return { ok: true as const };
            }),
        ),

    removeAll: mutation
        .output(scenarioRemoveAllOutputSchema)
        .mutation(async ({ ctx }) => {
            const removed = await ctx.db
                .delete(propSavedScenario)
                .where(eq(propSavedScenario.userId, ctx.userId))
                .returning({ id: propSavedScenario.id });
            return { removed: removed.length };
        }),

    save: mutation
        .input(scenarioSaveSchema)
        .output(propSavedScenarioOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                if ((await repo.loadScenarioIdByName(input.name)) === null) {
                    await quotas.assertWithin(PropQuota.Scenarios, 1);
                }
                const [row] = await tx
                    .insert(propSavedScenario)
                    .values({ ...input, userId: ctx.userId })
                    .onConflictDoUpdate({
                        set: { query: input.query, updatedAt: new Date() },
                        setWhere: eq(propSavedScenario.userId, ctx.userId),
                        target: [
                            propSavedScenario.userId,
                            propSavedScenario.name,
                        ],
                    })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Scenario);
            }),
        ),
});
