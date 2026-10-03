import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    PropQuota,
    PropRecord,
    propSizingDecisionOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    accountIdSchema,
    decisionCreateSchema,
    decisionRecordActualSchema,
    ledgerListSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propSizingDecision } from '~/server/db/schemas/prop';

import {
    assertModeledForOperation,
    assertStageMatchesAccount,
    ModeledOperation,
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Decision);

export const propDecisionRouter = createTRPCRouter({
    create: mutation
        .input(decisionCreateSchema)
        .output(propSizingDecisionOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const account = await repo.loadOwnedAccountOrThrow(
                    input.accountId,
                    true,
                );
                assertModeledForOperation(account, ModeledOperation.PlanRules);
                assertStageMatchesAccount(account, input.stage);
                if (input.snapshotId !== null) {
                    await repo.loadOwnedSnapshotOrThrow(
                        input.snapshotId,
                        input.accountId,
                    );
                }
                await quotas.assertWithin(PropQuota.Decisions, 1);
                const [row] = await tx
                    .insert(propSizingDecision)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Decision);
            }),
        ),

    latestForAll: propProcedure
        .output(z.array(propSizingDecisionOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).latestDecisions(),
        ),

    list: propProcedure
        .input(ledgerListSchema)
        .output(z.array(propSizingDecisionOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listDecisions(
                input.accountId,
            ),
        ),

    listForAccount: propProcedure
        .input(accountIdSchema)
        .output(z.array(propSizingDecisionOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listDecisions(input.id),
        ),

    recordActual: mutation
        .input(decisionRecordActualSchema)
        .output(propSizingDecisionOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const decision = await repo.loadOwnedDecisionOrThrow(input.id);
                const [row] = await tx
                    .update(propSizingDecision)
                    .set({
                        actualRiskCents: input.actualRiskCents,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(propSizingDecision.id, decision.id),
                            eq(propSizingDecision.userId, ctx.userId),
                        ),
                    )
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Decision);
            }),
        ),
});
