import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    AccountEventKind,
    AccountStage,
    accountStageOn,
    type AccountStageStarts,
    fundedSince,
    isModeledAccount,
    type LedgerAccount,
    NO_RECORDED_STAGE_STARTS,
    PlanKeyResolutionKind,
    PortfolioLedger,
    resolvePlanKey,
    SnapshotSource,
} from '~/lib/prop-accounts';
import {
    PROP_QUOTA_LIMITS,
    PropAccountRepo,
    type PropDatabase,
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
    propAccountEvent,
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

type ReviewedAccount = Awaited<
    ReturnType<PropAccountRepo['listAccounts']>
>[number];

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

function ledgerStageStarts(entry: LedgerAccount): AccountStageStarts {
    return {
        evalPassedOn: fundedSince(entry)?.on ?? null,
        movedLiveOn:
            entry.transitions.find(
                (transition) => transition.to.stage === AccountStage.Live,
            )?.on ?? null,
    };
}

async function loadStageStarts(
    database: PropDatabase,
    userId: string,
    accounts: ReadonlyMap<string, ReviewedAccount>,
): Promise<ReadonlyMap<string, AccountStageStarts>> {
    const staged = accounts
        .values()
        .filter((account) => account.stage !== AccountStage.Eval)
        .toArray();
    if (staged.length === 0) return new Map();
    const stagedIds = staged.map((account) => account.id);
    const events = await database
        .select({
            accountId: propAccountEvent.accountId,
            createdAt: propAccountEvent.createdAt,
            id: propAccountEvent.id,
            kind: propAccountEvent.kind,
            occurredOn: propAccountEvent.occurredOn,
            userId: propAccountEvent.userId,
        })
        .from(propAccountEvent)
        .where(
            and(
                eq(propAccountEvent.userId, userId),
                inArray(propAccountEvent.accountId, stagedIds),
                ne(propAccountEvent.kind, AccountEventKind.Edited),
            ),
        )
        .orderBy(asc(propAccountEvent.occurredOn))
        .limit(PROP_QUOTA_LIMITS[PropQuota.Events]);
    const ledger = PortfolioLedger.fromRows(userId, {
        accounts: staged,
        events,
        fees: [],
        payouts: [],
    });
    return new Map(
        ledger.accounts.map((entry) => [
            entry.row.id,
            ledgerStageStarts(entry),
        ]),
    );
}

function reviewStageOf(
    account: ReviewedAccount,
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
    accounts: ReadonlyMap<string, ReviewedAccount>,
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
                    ? [
                          {
                              accountId: account.id,
                              stage: reviewStageOf(
                                  account,
                                  resolution.plan,
                                  stageStarts,
                                  input.asOf,
                              ),
                          },
                      ]
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
