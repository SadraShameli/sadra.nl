import 'server-only';
import { z } from 'zod';

import { SnapshotSource } from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PropAccountRepo,
    PropQuotaGuard,
} from '~/lib/prop-accounts/server';
import { AdviceSource } from '~/lib/prop-calculator/advisor';
import {
    propAccountSnapshotOutputSchema,
    PropQuota,
    propSizingDecisionOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import { weeklyReviewSubmitSchema } from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import {
    propAccountSnapshot,
    propSizingDecision,
} from '~/server/db/schemas/prop';

import {
    assertModeledForOperation,
    ModeledOperation,
    propMutationProcedure,
    PropRouterBucket,
    resolvedPlanOrThrow,
} from './mutationGuard';
import {
    assertNotStored,
    assertPlausible,
    assertRequiredFields,
    type StagedSnapshot,
    type StagedSnapshotEntry,
} from './snapshotGuards';

type WeeklyReviewInput = z.output<typeof weeklyReviewSubmitSchema>;

const REVIEW_REMEDY = '';

const mutation = propMutationProcedure(PropRouterBucket.Snapshot);

const reviewSubmitOutputSchema = z.object({
    decisions: z.array(propSizingDecisionOutputSchema),
    snapshots: z.array(propAccountSnapshotOutputSchema),
});

function stagedFor(
    input: WeeklyReviewInput,
    accounts: ReadonlyMap<string, OwnedAccount>,
): readonly StagedSnapshot[] {
    return input.snapshots.map((entry) => {
        const account = accounts.get(entry.accountId);
        if (account === undefined) {
            throw new Error('the account was not loaded for this snapshot');
        }
        assertModeledForOperation(account, ModeledOperation.PlanRules);
        const plan = resolvedPlanOrThrow(account);
        return {
            account,
            plan,
            snapshot: { ...entry, asOf: input.asOf },
            stage: account.stage,
        };
    });
}

export const propReviewRouter = createTRPCRouter({
    submit: mutation
        .input(weeklyReviewSubmitSchema)
        .output(reviewSubmitOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const accounts = await repo.loadOwnedAccountsOrThrow([
                    ...new Set([
                        ...input.snapshots.map((entry) => entry.accountId),
                        ...input.decisions.map((entry) => entry.accountId),
                    ]),
                ]);
                const staged = stagedFor(input, accounts);
                assertRequiredFields(staged, REVIEW_REMEDY);
                assertPlausible(staged, REVIEW_REMEDY);
                const snapshotEntries: StagedSnapshotEntry[] = staged.map(
                    (entry) => entry.snapshot,
                );
                await assertNotStored(
                    tx,
                    ctx.userId,
                    snapshotEntries,
                    accounts,
                );
                await quotas.assertWithin(
                    PropQuota.Snapshots,
                    input.snapshots.length,
                );
                await quotas.assertWithin(
                    PropQuota.Decisions,
                    input.decisions.length,
                );
                const insertedSnapshots =
                    input.snapshots.length === 0
                        ? []
                        : await tx
                              .insert(propAccountSnapshot)
                              .values(
                                  input.snapshots.map((entry) => ({
                                      ...entry,
                                      asOf: input.asOf,
                                      source: SnapshotSource.WeeklyReview,
                                      userId: ctx.userId,
                                  })),
                              )
                              .returning();
                const snapshotIdByAccount = new Map(
                    insertedSnapshots.map((row) => [row.accountId, row.id]),
                );
                const insertedDecisions =
                    input.decisions.length === 0
                        ? []
                        : await tx
                              .insert(propSizingDecision)
                              .values(
                                  input.decisions.map((entry) => {
                                      const account = accounts.get(
                                          entry.accountId,
                                      );
                                      if (account === undefined) {
                                          throw new Error(
                                              'the account was not loaded for this decision',
                                          );
                                      }
                                      const snapshotId =
                                          snapshotIdByAccount.get(
                                              entry.accountId,
                                          );
                                      if (snapshotId === undefined) {
                                          throw new Error(
                                              'no stored snapshot id was found for this decision account',
                                          );
                                      }
                                      return {
                                          ...entry,
                                          decidedOn: input.asOf,
                                          note: null,
                                          snapshotId,
                                          source: AdviceSource.Documented,
                                          stage: account.stage,
                                          userId: ctx.userId,
                                      };
                                  }),
                              )
                              .returning();
                return {
                    decisions: insertedDecisions,
                    snapshots: insertedSnapshots,
                };
            }),
        ),
});
