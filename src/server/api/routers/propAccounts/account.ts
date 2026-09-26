import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    type AccountEventChange,
    type AccountEventChangeValue,
    AccountEventKind,
    AccountStatus,
    compareText,
    describeLifecycleRejection,
    validateStageForPlan,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PropAccountRepo,
    type PropDatabase,
    PropQuotaGuard,
    readAccount,
} from '~/lib/prop-accounts/server';
import { type Plan } from '~/lib/prop-calculator';
import {
    okOutputSchema,
    propAccountArchiveOutputSchema,
    propAccountListedOutputSchema,
    propAccountOutputSchema,
    PropMutationRejection,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    accountCreateSchema,
    accountIdSchema,
    accountListSchema,
    accountUpdateSchema,
    importAccountsSchema,
} from '~/lib/schemas/propAccounts';
import { stableJson } from '~/lib/stableJson';
import { createTRPCRouter } from '~/server/api/trpc';
import { propAccount, propAccountEvent } from '~/server/db/schemas/prop';

import {
    assertCopyGroupAcceptsStages,
    assertLiveStartsDocumented,
    impliedPassBound,
    type LiveStartEntry,
    propMutationProcedure,
    PropMutationRejectionError,
    propProcedure,
    PropRouterBucket,
    resolvedPlanOrThrow,
    returnedRowOrThrow,
} from './mutationGuard';

type AccountCreateInput = z.output<typeof accountCreateSchema>;
type AccountUpdateInput = z.output<typeof accountUpdateSchema>;

const EDITABLE_FIELDS = [
    'accountSize',
    'copyGroupId',
    'dashboardConvention',
    'externalAlias',
    'firmId',
    'firstFundedTradeOn',
    'fundedOn',
    'label',
    'liveStartBalanceCents',
    'notes',
    'optIns',
    'personalRules',
    'planSerial',
    'purchasedOn',
    'replacesAccountId',
    'tags',
] as const satisfies readonly (keyof AccountUpdateInput & keyof OwnedAccount)[];

type EditableFields = Pick<
    AccountUpdateInput,
    (typeof EDITABLE_FIELDS)[number]
>;

type EditableValues = Required<EditableFields>;

const IMPLIED_PASS_FIELDS: ReadonlySet<string> = new Set<
    (typeof EDITABLE_FIELDS)[number]
>(['accountSize', 'firmId', 'fundedOn', 'optIns', 'planSerial']);

const mutation = propMutationProcedure(PropRouterBucket.Account);

export const propAccountRouter = createTRPCRouter({
    archive: mutation
        .input(accountIdSchema)
        .output(propAccountArchiveOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountRefOrThrow(
                    input.id,
                    true,
                );
                if (stored.archivedAt !== null) {
                    return { archivedAt: stored.archivedAt, id: stored.id };
                }
                await quotas.assertWithin(PropQuota.Events, 1);
                const archivedAt = new Date();
                const [row] = await tx
                    .update(propAccount)
                    .set({ archivedAt, updatedAt: archivedAt })
                    .where(ownedAccount(stored.id, ctx.userId))
                    .returning({
                        archivedAt: propAccount.archivedAt,
                        id: propAccount.id,
                    });
                await repo.recordEdits(
                    [
                        {
                            accountId: stored.id,
                            changes: [
                                {
                                    field: 'archivedAt',
                                    from: null,
                                    to: archivedAt.toISOString(),
                                },
                            ],
                            purchasedOn: stored.purchasedOn,
                        },
                    ],
                    archivedAt,
                );
                return returnedRowOrThrow(row, PropRecord.Account);
            }),
        ),

    create: mutation
        .input(accountCreateSchema)
        .output(propAccountOutputSchema)
        .mutation(({ ctx, input }) => {
            assertLiveStartsDocumented([createdLiveStartEntry(input)]);
            return ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const [created] = await insertAccounts(tx, ctx.userId, quotas, [
                    input,
                ]);
                return returnedRowOrThrow(created, PropRecord.Account);
            });
        }),

    get: propProcedure
        .input(accountIdSchema)
        .output(propAccountOutputSchema)
        .query(({ ctx, input }) =>
            new PropAccountRepo(
                ctx.db,
                ctx.userId,
            ).loadPlanTolerantAccountOrThrow(input.id),
        ),

    importMany: mutation
        .input(importAccountsSchema)
        .output(z.array(propAccountOutputSchema))
        .mutation(({ ctx, input }) => {
            assertDistinctLabels(input);
            assertLiveStartsDocumented(input.map(createdLiveStartEntry));
            return ctx.db.transaction(async (tx) =>
                insertAccounts(
                    tx,
                    ctx.userId,
                    await PropQuotaGuard.acquire(tx, ctx.userId),
                    input,
                ),
            );
        }),

    list: propProcedure
        .input(accountListSchema)
        .output(z.array(propAccountListedOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listAccounts(input),
        ),

    remove: mutation
        .input(accountIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountRefOrThrow(
                    input.id,
                    true,
                );
                const replacing = await repo.listAccountsReplacing(stored.id);
                if (replacing.length > 0) {
                    const now = new Date();
                    await tx
                        .update(propAccount)
                        .set({ replacesAccountId: null, updatedAt: now })
                        .where(
                            and(
                                eq(propAccount.userId, ctx.userId),
                                eq(propAccount.replacesAccountId, stored.id),
                            ),
                        );
                    await repo.recordEdits(
                        replacing.map((account) => ({
                            accountId: account.id,
                            changes: [
                                {
                                    field: 'replacesAccountId',
                                    from: stored.id,
                                    to: null,
                                },
                            ],
                            purchasedOn: account.purchasedOn,
                        })),
                        now,
                    );
                }
                await tx
                    .delete(propAccount)
                    .where(ownedAccount(stored.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    unarchive: mutation
        .input(accountIdSchema)
        .output(propAccountListedOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountRefOrThrow(
                    input.id,
                    true,
                );
                if (stored.archivedAt === null) {
                    return repo.loadListedAccountOrThrow(stored.id);
                }
                await quotas.assertWithin(PropQuota.Events, 1);
                const now = new Date();
                const restored = await repo.restoreArchivedAccount(
                    stored.id,
                    now,
                );
                await repo.recordEdits(
                    [
                        {
                            accountId: stored.id,
                            changes: [
                                {
                                    field: 'archivedAt',
                                    from: stored.archivedAt.toISOString(),
                                    to: null,
                                },
                            ],
                            purchasedOn: stored.purchasedOn,
                        },
                    ],
                    now,
                );
                return restored;
            }),
        ),

    update: mutation
        .input(accountUpdateSchema)
        .output(propAccountOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountOrThrow(
                    input.id,
                    true,
                );
                const plan = assertStageStillOffered(stored, input);
                assertLiveStartsDocumented([
                    {
                        account: input,
                        label: input.label,
                        plan,
                    },
                ]);
                if (
                    input.replacesAccountId !== null &&
                    input.replacesAccountId !== stored.replacesAccountId
                ) {
                    await repo.loadOwnedAccountsOrThrow([
                        input.replacesAccountId,
                    ]);
                }
                if (
                    input.copyGroupId !== null &&
                    input.copyGroupId !== stored.copyGroupId
                ) {
                    await assertCopyGroupAcceptsStages(
                        repo,
                        input.copyGroupId,
                        [stored.stage],
                        stored.id,
                    );
                }
                const isPurchaseMoved =
                    input.purchasedOn !== stored.purchasedOn;
                if (isPurchaseMoved) {
                    assertPurchaseBefore(
                        input.purchasedOn,
                        await repo.earliestLifecycleEventOn(stored.id),
                    );
                }
                const changes = accountChanges(stored, input);
                if (changes.length === 0) return stored;
                if (
                    changes.some((change) =>
                        IMPLIED_PASS_FIELDS.has(change.field),
                    )
                ) {
                    await assertFundedBeforeLifecycle(
                        repo,
                        {
                            ...stored,
                            fundedOn: input.fundedOn,
                            purchasedOn: input.purchasedOn,
                        },
                        plan,
                    );
                }
                await quotas.assertWithin(PropQuota.Events, 1);
                const now = new Date();
                const [row] = await tx
                    .update(propAccount)
                    .set({ ...editableValues(input), updatedAt: now })
                    .where(ownedAccount(stored.id, ctx.userId))
                    .returning();
                if (isPurchaseMoved) {
                    await repo.movePurchasedEvent(stored.id, input.purchasedOn);
                }
                await repo.recordEdits(
                    [
                        {
                            accountId: stored.id,
                            changes,
                            purchasedOn: input.purchasedOn,
                        },
                    ],
                    now,
                );
                return readAccount(returnedRowOrThrow(row, PropRecord.Account));
            }),
        ),
});

function accountChanges(
    stored: OwnedAccount,
    input: AccountUpdateInput,
): AccountEventChange[] {
    return EDITABLE_FIELDS.flatMap((field) => {
        const from = changeValue(stored[field]);
        const to = changeValue(input[field]);
        return from === to ? [] : [{ field, from, to }];
    });
}

function assertDistinctLabels(rows: readonly AccountCreateInput[]): void {
    const seen = new Set<string>();
    for (const row of rows) {
        if (seen.has(row.label)) {
            throw new PropMutationRejectionError(
                PropMutationRejection.DuplicateImportLabel,
                `Two rows share the label "${row.label}"; every active account needs its own label`,
            );
        }
        seen.add(row.label);
    }
}

async function assertFundedBeforeLifecycle(
    repo: PropAccountRepo,
    account: Pick<OwnedAccount, 'fundedOn' | 'id' | 'purchasedOn' | 'stage'>,
    plan: Plan,
): Promise<void> {
    const impliedPassOn = await impliedPassBound(repo, account, plan);
    if (impliedPassOn === null) return;
    const earliestEventOn = await repo.earliestLifecycleEventOn(account.id);
    if (
        earliestEventOn !== null &&
        compareText(earliestEventOn, impliedPassOn) < 0
    ) {
        throw new PropMutationRejectionError(
            PropMutationRejection.OutOfOrderEvent,
            `The funded date ${impliedPassOn} is after the first recorded lifecycle event on ${earliestEventOn}, which needs the evaluation already passed; pick a funded date on or before it, or record the pass itself first`,
        );
    }
}

function assertPurchaseBefore(
    purchasedOn: string,
    earliestEventOn: null | string,
): void {
    if (
        earliestEventOn !== null &&
        compareText(earliestEventOn, purchasedOn) < 0
    ) {
        throw new PropMutationRejectionError(
            PropMutationRejection.OutOfOrderEvent,
            `The purchase date ${purchasedOn} is after the first recorded lifecycle event on ${earliestEventOn}; pick a purchase date on or before it`,
        );
    }
}

function assertStageStillOffered(
    stored: OwnedAccount,
    input: AccountUpdateInput,
): Plan {
    const plan = resolvedPlanOrThrow(input);
    const rejection = validateStageForPlan(stored.stage, plan);
    if (rejection !== null) {
        throw new PropMutationRejectionError(
            PropMutationRejection.StageNotOfferedByPlan,
            describeLifecycleRejection(rejection, {
                facts: plan,
                stage: stored.stage,
            }),
            rejection,
        );
    }
    return plan;
}

function changeValue(value: unknown): AccountEventChangeValue {
    return value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string'
        ? value
        : stableJson(value);
}

function createdLiveStartEntry(row: AccountCreateInput): LiveStartEntry {
    return {
        account: row,
        label: row.label,
        plan: resolvedPlanOrThrow({ ...row, readIssues: [] }),
    };
}

function editableValues(input: EditableFields): EditableValues {
    return {
        accountSize: input.accountSize,
        copyGroupId: input.copyGroupId,
        dashboardConvention: input.dashboardConvention,
        externalAlias: input.externalAlias,
        firmId: input.firmId,
        firstFundedTradeOn: input.firstFundedTradeOn,
        fundedOn: input.fundedOn,
        label: input.label,
        liveStartBalanceCents: input.liveStartBalanceCents,
        notes: input.notes,
        optIns: input.optIns,
        personalRules: input.personalRules,
        planSerial: input.planSerial,
        purchasedOn: input.purchasedOn,
        replacesAccountId: input.replacesAccountId,
        tags: input.tags,
    };
}

async function insertAccounts(
    tx: PropDatabase,
    userId: string,
    quotas: PropQuotaGuard,
    rows: readonly AccountCreateInput[],
): Promise<OwnedAccount[]> {
    const repo = new PropAccountRepo(tx, userId);
    await repo.loadOwnedAccountsOrThrow(
        rows.flatMap((row) =>
            row.replacesAccountId === null ? [] : [row.replacesAccountId],
        ),
    );
    const groupIds = new Set(
        rows.flatMap((row) =>
            row.copyGroupId === null ? [] : [row.copyGroupId],
        ),
    );
    for (const groupId of groupIds) {
        await assertCopyGroupAcceptsStages(
            repo,
            groupId,
            rows
                .filter((row) => row.copyGroupId === groupId)
                .map((row) => row.stage),
            null,
        );
    }
    await quotas.assertWithin(PropQuota.Accounts, rows.length);
    await quotas.assertWithin(PropQuota.Events, rows.length);
    const created = await tx
        .insert(propAccount)
        .values(
            rows.map((row) => ({
                ...editableValues(row),
                stage: row.stage,
                status: AccountStatus.Active,
                userId,
            })),
        )
        .returning();
    await tx.insert(propAccountEvent).values(
        created.map((row) => ({
            accountId: row.id,
            detail: { changes: [], note: null },
            kind: AccountEventKind.Purchased,
            occurredOn: row.purchasedOn,
            userId,
        })),
    );
    return created.map(readAccount);
}

function ownedAccount(id: string, userId: string) {
    return and(eq(propAccount.id, id), eq(propAccount.userId, userId));
}
