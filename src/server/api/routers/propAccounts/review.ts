import 'server-only';
import { z } from 'zod';

import {
    AccountStage,
    accountStageOn,
    type AccountStageStarts,
    isModeledAccount,
    NO_RECORDED_STAGE_STARTS,
    PlanKeyResolutionKind,
    resolvePlanKey,
    SnapshotSource,
} from '~/lib/prop-accounts';
import {
    type ListedAccount,
    PropAccountRepo,
    PropQuotaGuard,
} from '~/lib/prop-accounts/server';
import { type Plan } from '~/lib/prop-calculator';
import { AdviceSource } from '~/lib/prop-calculator/advisor';
import {
    propAccountSnapshotOutputSchema,
    PropQuota,
    propSizingDecisionOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    accountDateSchema,
    weeklyReviewSubmitSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import {
    propAccountSnapshot,
    propSizingDecision,
} from '~/server/db/schemas/prop';

import {
    assertModeledForOperation,
    ModeledOperation,
    propMutationProcedure,
    propProcedure,
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
import { loadStageStarts } from './stageStarts';

type WeeklyReviewInput = z.output<typeof weeklyReviewSubmitSchema>;

const REVIEW_REMEDY = '';

const mutation = propMutationProcedure(PropRouterBucket.Snapshot);

const reviewStagesInputSchema = z.object({ asOf: accountDateSchema });

const reviewStagesOutputSchema = z.array(
    z.object({ accountId: z.string(), stage: z.enum(AccountStage) }),
);

const reviewSubmitOutputSchema = z.object({
    decisions: z.array(propSizingDecisionOutputSchema),
    snapshots: z.array(propAccountSnapshotOutputSchema),
});

function reviewStageOf(
    account: ListedAccount,
    plan: Plan,
    stageStarts: ReadonlyMap<string, AccountStageStarts>,
    asOf: string,
): AccountStage {
    return accountStageOn(
        account,
        plan,
        stageStarts.get(account.id) ?? NO_RECORDED_STAGE_STARTS,
        asOf,
    );
}

function stagedFor(
    input: WeeklyReviewInput,
    accounts: ReadonlyMap<string, ListedAccount>,
    stageStarts: ReadonlyMap<string, AccountStageStarts>,
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
            stage: reviewStageOf(account, plan, stageStarts, input.asOf),
        };
    });
}

export const propReviewRouter = createTRPCRouter({
    stagesOn: propProcedure
        .input(reviewStagesInputSchema)
        .output(reviewStagesOutputSchema)
        .query(async ({ ctx, input }) => {
            const listed = await new PropAccountRepo(
                ctx.db,
                ctx.userId,
            ).listAccounts({ includeArchived: false });
            const modeled = listed
                .filter(isModeledAccount)
                .filter((account) => account.readIssues.length === 0);
            const stageStarts = await loadStageStarts(
                ctx.db,
                ctx.userId,
                new Map(modeled.map((account) => [account.id, account])),
            );
            return modeled.flatMap((account) => {
                const resolution = resolvePlanKey(account);
                return resolution.kind === PlanKeyResolutionKind.Resolved
                    ? {
                          accountId: account.id,
                          stage: reviewStageOf(
                              account,
                              resolution.plan,
                              stageStarts,
                              input.asOf,
                          ),
                      }
                    : [];
            });
        }),

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
                const staged = stagedFor(
                    input,
                    accounts,
                    await loadStageStarts(tx, ctx.userId, accounts),
                );
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
