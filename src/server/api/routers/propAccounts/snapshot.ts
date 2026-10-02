import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    AccountEventKind,
    AccountStage,
    accountStageOn,
    type AccountStageStarts,
    AccountTracking,
    fundedSince,
    isLedgerOnlySnapshotField,
    type LedgerAccount,
    NO_RECORDED_STAGE_STARTS,
    PortfolioLedger,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PROP_QUOTA_LIMITS,
    PropAccountRepo,
    type PropDatabase,
    PropQuotaGuard,
} from '~/lib/prop-accounts/server';
import { type Plan } from '~/lib/prop-calculator';
import {
    okOutputSchema,
    propAccountSnapshotOutputSchema,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    accountIdSchema,
    entityIdSchema,
    snapshotBulkCreateSchema,
    snapshotCreateSchema,
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
    returnedRowOrThrow,
} from './mutationGuard';
import {
    assertNotStored,
    assertPlausible,
    assertRequiredFields,
    type StagedSnapshot,
} from './snapshotGuards';

type SnapshotInput = z.output<typeof snapshotCreateSchema>;

const NEW_SNAPSHOT_REMEDY = '';

const SNAPSHOT_RECORD_KEYS: ReadonlySet<string> = new Set<keyof SnapshotInput>([
    'accountId',
    'source',
]);

const UPGRADE_SNAPSHOT_REMEDY =
    '; remove that snapshot before upgrading and enter a new one once the account follows the plan';

const mutation = propMutationProcedure(PropRouterBucket.Snapshot);

export async function assertStoredSnapshotsFit(
    repo: PropAccountRepo,
    database: PropDatabase,
    userId: string,
    account: OwnedAccount,
    plan: Plan,
): Promise<void> {
    const snapshots = await repo.listSnapshotsForAccount(account.id);
    if (snapshots.length === 0) return;
    const recorded = await loadStageStarts(
        database,
        userId,
        new Map([[account.id, account]]),
    );
    const stageStarts = recorded.get(account.id) ?? NO_RECORDED_STAGE_STARTS;
    const staged = snapshots.map((snapshot): StagedSnapshot => ({
        account,
        plan,
        snapshot,
        stage: accountStageOn(account, plan, stageStarts, snapshot.asOf),
    }));
    assertRequiredFields(staged, UPGRADE_SNAPSHOT_REMEDY);
    assertPlausible(staged, UPGRADE_SNAPSHOT_REMEDY);
}

function assertLedgerOnlyFields(
    input: readonly SnapshotInput[],
    accounts: ReadonlyMap<string, OwnedAccount>,
): void {
    for (const snapshot of input) {
        const account = accounts.get(snapshot.accountId);
        if (account?.tracking !== AccountTracking.LedgerOnly) continue;
        const hasPlanField = Object.entries(snapshot).some(
            ([field, value]) =>
                value !== null &&
                !SNAPSHOT_RECORD_KEYS.has(field) &&
                !isLedgerOnlySnapshotField(field),
        );
        if (hasPlanField) {
            assertModeledForOperation(
                account,
                ModeledOperation.PlanSnapshotFields,
            );
        }
    }
}

async function assertStorable(
    database: PropDatabase,
    userId: string,
    input: readonly SnapshotInput[],
    accounts: ReadonlyMap<string, OwnedAccount>,
): Promise<void> {
    assertLedgerOnlyFields(input, accounts);
    const staged = await stagedSnapshots(database, userId, input, accounts);
    assertRequiredFields(staged, NEW_SNAPSHOT_REMEDY);
    assertPlausible(staged, NEW_SNAPSHOT_REMEDY);
}

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
    accounts: ReadonlyMap<string, OwnedAccount>,
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

async function stagedSnapshots(
    database: PropDatabase,
    userId: string,
    input: readonly SnapshotInput[],
    accounts: ReadonlyMap<string, OwnedAccount>,
): Promise<readonly StagedSnapshot[]> {
    const stageStarts = await loadStageStarts(database, userId, accounts);
    return input.flatMap((snapshot): StagedSnapshot[] => {
        const account = accounts.get(snapshot.accountId);
        if (account?.tracking !== AccountTracking.Modeled) return [];
        const plan = resolvedPlanOrThrow(account);
        const stage = accountStageOn(
            account,
            plan,
            stageStarts.get(account.id) ?? NO_RECORDED_STAGE_STARTS,
            snapshot.asOf,
        );
        return [{ account, plan, snapshot, stage }];
    });
}

export const propSnapshotRouter = createTRPCRouter({
    bulkCreate: mutation
        .input(snapshotBulkCreateSchema)
        .output(z.array(propAccountSnapshotOutputSchema))
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const accounts = await repo.loadOwnedAccountsOrThrow(
                    input.map((snapshot) => snapshot.accountId),
                );
                await assertStorable(tx, ctx.userId, input, accounts);
                await assertNotStored(tx, ctx.userId, input, accounts);
                await quotas.assertWithin(PropQuota.Snapshots, input.length);
                return tx
                    .insert(propAccountSnapshot)
                    .values(
                        input.map((snapshot) => ({
                            ...snapshot,
                            userId: ctx.userId,
                        })),
                    )
                    .returning();
            }),
        ),

    create: mutation
        .input(snapshotCreateSchema)
        .output(propAccountSnapshotOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const account = await repo.loadOwnedAccountOrThrow(
                    input.accountId,
                );
                await assertStorable(
                    tx,
                    ctx.userId,
                    [input],
                    new Map([[account.id, account]]),
                );
                await quotas.assertWithin(PropQuota.Snapshots, 1);
                const [row] = await tx
                    .insert(propAccountSnapshot)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Snapshot);
            }),
        ),

    latestForAll: propProcedure
        .output(z.array(propAccountSnapshotOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).latestSnapshots(),
        ),

    latestTwoForAll: propProcedure
        .output(z.array(propAccountSnapshotOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).latestTwoSnapshots(),
        ),

    listForAccount: propProcedure
        .input(accountIdSchema)
        .output(z.array(propAccountSnapshotOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listSnapshotsForAccount(
                input.id,
            ),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const snapshot = await repo.loadOwnedSnapshotOrThrow(input.id);
                const account = await repo.loadOwnedAccountOrThrow(
                    snapshot.accountId,
                );
                await quotas.assertWithin(PropQuota.Events, 1);
                const now = new Date();
                await tx
                    .update(propSizingDecision)
                    .set({ snapshotId: null, updatedAt: now })
                    .where(
                        and(
                            eq(propSizingDecision.userId, ctx.userId),
                            eq(
                                propSizingDecision.accountId,
                                snapshot.accountId,
                            ),
                            eq(propSizingDecision.snapshotId, snapshot.id),
                        ),
                    );
                await tx
                    .delete(propAccountSnapshot)
                    .where(
                        and(
                            eq(propAccountSnapshot.id, snapshot.id),
                            eq(propAccountSnapshot.userId, ctx.userId),
                        ),
                    );
                await repo.recordEdits(
                    [
                        {
                            accountId: snapshot.accountId,
                            changes: [
                                {
                                    field: 'snapshot.asOf',
                                    from: snapshot.asOf,
                                    to: null,
                                },
                                {
                                    field: 'snapshot.balanceCents',
                                    from: snapshot.balanceCents,
                                    to: null,
                                },
                            ],
                            purchasedOn: account.purchasedOn,
                        },
                    ],
                    now,
                );
                return { ok: true as const };
            }),
        ),
});
