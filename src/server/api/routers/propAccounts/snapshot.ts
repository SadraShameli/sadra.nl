import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    AccountEventKind,
    AccountStage,
    accountStageOn,
    type AccountStageStarts,
    compareText,
    type MissingSnapshotField,
    missingSnapshotFields,
    snapshotFieldRules,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PROP_QUOTA_LIMITS,
    PropAccountRepo,
    type PropDatabase,
    PropQuotaGuard,
} from '~/lib/prop-accounts/server';
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
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    resolvedPlanOrThrow,
    returnedRowOrThrow,
} from './mutationGuard';

interface SnapshotGap {
    readonly missing: readonly string[];
    readonly snapshot: SnapshotInput;
    readonly stage: AccountStage;
}

type SnapshotInput = z.output<typeof snapshotCreateSchema>;

type StageEvent = Pick<
    typeof propAccountEvent.$inferSelect,
    'accountId' | 'kind' | 'occurredOn'
>;

const mutation = propMutationProcedure(PropRouterBucket.Snapshot);

const STAGE_START_EVENTS = [
    AccountEventKind.EvalPassed,
    AccountEventKind.MovedLive,
] as const;

const NOTHING_RECORDED: AccountStageStarts = {
    evalPassedOn: null,
    movedLiveOn: null,
};

function accountLabelOf(
    accounts: ReadonlyMap<string, OwnedAccount>,
    snapshot: SnapshotInput,
): string {
    return accounts.get(snapshot.accountId)?.label ?? snapshot.accountId;
}

async function assertNotStored(
    database: PropDatabase,
    userId: string,
    input: readonly SnapshotInput[],
    accounts: ReadonlyMap<string, OwnedAccount>,
): Promise<void> {
    const accountIds = [
        ...new Set(input.map((snapshot) => snapshot.accountId)),
    ];
    const dates = [...new Set(input.map((snapshot) => snapshot.asOf))];
    const stored = await database
        .select({
            accountId: propAccountSnapshot.accountId,
            asOf: propAccountSnapshot.asOf,
        })
        .from(propAccountSnapshot)
        .where(
            and(
                eq(propAccountSnapshot.userId, userId),
                inArray(propAccountSnapshot.accountId, accountIds),
                inArray(propAccountSnapshot.asOf, dates),
            ),
        )
        .limit(PROP_QUOTA_LIMITS[PropQuota.Snapshots]);
    const storedKeys = new Set(
        stored.map((row) => snapshotKey(row.accountId, row.asOf)),
    );
    const duplicate = input.find((snapshot) =>
        storedKeys.has(snapshotKey(snapshot.accountId, snapshot.asOf)),
    );
    if (duplicate === undefined) return;
    throw new TRPCError({
        code: 'CONFLICT',
        message: `A snapshot for "${accountLabelOf(accounts, duplicate)}" on ${duplicate.asOf} is already stored; remove it first or use another date`,
    });
}

function assertRequiredFields(
    input: readonly SnapshotInput[],
    accounts: ReadonlyMap<string, OwnedAccount>,
    stageStarts: ReadonlyMap<string, AccountStageStarts>,
): void {
    const gaps: SnapshotGap[] = [];
    for (const snapshot of input) {
        const account = accounts.get(snapshot.accountId);
        if (account === undefined) continue;
        const plan = resolvedPlanOrThrow(account);
        const stage = accountStageOn(
            account,
            plan,
            stageStarts.get(account.id) ?? NOTHING_RECORDED,
            snapshot.asOf,
        );
        const missing = missingFieldLabels(
            missingSnapshotFields(
                snapshotFieldRules(plan, stage),
                (field) => snapshot[field] !== null,
            ),
        );
        if (missing.length > 0) gaps.push({ missing, snapshot, stage });
    }
    const [first] = gaps;
    if (first === undefined) return;
    const others =
        gaps.length > 1
            ? ` (and ${String(gaps.length - 1)} more snapshots with missing fields)`
            : '';
    throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `The snapshot for "${accountLabelOf(accounts, first.snapshot)}" on ${first.snapshot.asOf} needs what its plan requires in the ${first.stage} stage: ${first.missing.join('; ')}${others}`,
    });
}

function earliestEventOn(
    events: readonly StageEvent[],
    accountId: string,
    kind: AccountEventKind,
): null | string {
    return (
        events
            .filter(
                (event) => event.accountId === accountId && event.kind === kind,
            )
            .map((event) => event.occurredOn)
            .toSorted(compareText)[0] ?? null
    );
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
            kind: propAccountEvent.kind,
            occurredOn: propAccountEvent.occurredOn,
        })
        .from(propAccountEvent)
        .where(
            and(
                eq(propAccountEvent.userId, userId),
                inArray(propAccountEvent.accountId, stagedIds),
                inArray(propAccountEvent.kind, STAGE_START_EVENTS),
            ),
        )
        .orderBy(asc(propAccountEvent.occurredOn))
        .limit(PROP_QUOTA_LIMITS[PropQuota.Events]);
    return new Map(
        staged.map((account) => [
            account.id,
            {
                evalPassedOn: earliestEventOn(
                    events,
                    account.id,
                    AccountEventKind.EvalPassed,
                ),
                movedLiveOn: earliestEventOn(
                    events,
                    account.id,
                    AccountEventKind.MovedLive,
                ),
            },
        ]),
    );
}

function missingFieldLabels(
    missing: readonly MissingSnapshotField[],
): string[] {
    return [
        ...new Set(
            missing.map((field) =>
                field.alternative === null
                    ? field.label
                    : [field.label, field.alternative.label]
                          .toSorted(compareText)
                          .join(' or '),
            ),
        ),
    ];
}

function snapshotKey(accountId: string, asOf: string): string {
    return `${accountId} ${asOf}`;
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
                assertRequiredFields(
                    input,
                    accounts,
                    await loadStageStarts(tx, ctx.userId, accounts),
                );
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
                await repo.loadOwnedAccountOrThrow(input.accountId);
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
