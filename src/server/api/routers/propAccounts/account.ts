import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    type AccountEventChange,
    type AccountEventChangeValue,
    AccountEventKind,
    type AccountRow,
    type AccountStage,
    AccountStatus,
    AccountTracking,
    compareText,
    describeLifecycleRejection,
    LEDGER_ONLY_LIFECYCLE_FACTS,
    type PlanLifecycleFacts,
    planOptInsSchema,
    upgradeChanges,
    upgradeChangeText,
    validateStageForPlan,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PropAccountRepo,
    type PropDatabase,
    PropQuotaGuard,
    readAccount,
    withPlanRulesChanged,
} from '~/lib/prop-accounts/server';
import { type Plan } from '~/lib/prop-calculator';
import { planRulesFingerprint } from '~/lib/prop-calculator/describe';
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
    accountUpgradeSchema,
    importAccountsSchema,
} from '~/lib/schemas/propAccounts';
import { stableJson } from '~/lib/stableJson';
import { createTRPCRouter } from '~/server/api/trpc';
import { propAccount, propAccountEvent } from '~/server/db/schemas/prop';

import {
    assertCopyGroupAcceptsStages,
    assertExternalFirmOwned,
    assertLiveStartsDocumented,
    assertModeledForOperation,
    impliedPassBound,
    type LiveStartEntry,
    ModeledOperation,
    ownedReferenceOrThrow,
    propMutationProcedure,
    PropMutationRejectionError,
    propProcedure,
    PropRouterBucket,
    resolvedPlanOrThrow,
    returnedRowOrThrow,
} from './mutationGuard';
import {
    assertRoundAcceptsMembership,
    assertRoundWithinBudget,
    loadOpenOwnedRoundOrThrow,
} from './round';
import { assertStoredSnapshotsFit } from './snapshot';

enum PurchaseBound {
    LifecycleEvent = 'lifecycle event',
    RuleViolation = 'rule violation',
}

type AccountCreateInput = z.output<typeof accountCreateSchema>;
type AccountInput = AccountCreateInput | AccountUpdateInput;
type AccountUpdateInput = z.output<typeof accountUpdateSchema>;
type AccountUpgradeInput = z.output<typeof accountUpgradeSchema>;
type ModeledUpdateInput = Extract<
    AccountUpdateInput,
    { readonly tracking: AccountTracking.Modeled }
>;

const EDITABLE_FIELDS = [
    'accountSize',
    'copyGroupId',
    'dashboardConvention',
    'externalAlias',
    'externalFirmId',
    'firmId',
    'firstFundedTradeOn',
    'fundedOn',
    'label',
    'liveStartBalanceCents',
    'notes',
    'optIns',
    'personalRules',
    'planLabel',
    'planSerial',
    'purchasedOn',
    'replacesAccountId',
    'roundId',
    'tags',
    'tracking',
] as const satisfies readonly (keyof AccountRow & keyof OwnedAccount)[];

type EditableValues = Pick<AccountRow, (typeof EDITABLE_FIELDS)[number]>;

const IMPLIED_PASS_FIELDS: ReadonlySet<string> = new Set<
    (typeof EDITABLE_FIELDS)[number]
>(['accountSize', 'firmId', 'fundedOn', 'optIns', 'planSerial', 'tracking']);

const PLAN_KEY_FIELDS: ReadonlySet<string> = new Set<
    (typeof EDITABLE_FIELDS)[number]
>(['accountSize', 'firmId', 'optIns', 'planSerial']);

const COPY_GROUP_NOT_OWNED =
    'The copy group you picked is not one of your copy groups';
const REPLACED_ACCOUNT_NOT_OWNED =
    'The account this one replaces is not one of your accounts';

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
            assertCopyGroupsModeled([input]);
            assertLiveStartsDocumented(createdLiveStartEntries([input]));
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
        .query(async ({ ctx, input }) => {
            const account = await new PropAccountRepo(
                ctx.db,
                ctx.userId,
            ).loadPlanTolerantAccountOrThrow(input.id);
            const [withChanged] = await withPlanRulesChanged([account]);
            return returnedRowOrThrow(withChanged, PropRecord.Account);
        }),

    importMany: mutation
        .input(importAccountsSchema)
        .output(z.array(propAccountOutputSchema))
        .mutation(({ ctx, input }) => {
            assertDistinctLabels(input);
            assertCopyGroupsModeled(input);
            assertLiveStartsDocumented(createdLiveStartEntries(input));
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
        .query(async ({ ctx, input }) => {
            const rows = await new PropAccountRepo(
                ctx.db,
                ctx.userId,
            ).listAccounts(input);
            return withPlanRulesChanged(rows);
        }),

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
                assertTrackingKept(stored, input);
                const plan =
                    input.tracking === AccountTracking.Modeled
                        ? assertStageStillOffered(stored, input)
                        : null;
                if (plan !== null) {
                    assertLiveStartsDocumented([
                        {
                            account: input,
                            label: input.label,
                            plan,
                        },
                    ]);
                }
                if (
                    input.replacesAccountId !== null &&
                    input.replacesAccountId !== stored.replacesAccountId
                ) {
                    await assertReplacedAccountsOwned(repo, [
                        input.replacesAccountId,
                    ]);
                }
                if (
                    input.copyGroupId !== null &&
                    input.copyGroupId !== stored.copyGroupId
                ) {
                    assertModeledForOperation(
                        input,
                        ModeledOperation.CopyGroup,
                    );
                    await assertOwnedCopyGroupAcceptsStages(
                        repo,
                        input.copyGroupId,
                        [stored.stage],
                        stored.id,
                    );
                }
                await assertExternalFirmOwned(repo, externalFirmIdsOf([input]));
                if (input.roundId !== stored.roundId) {
                    await assertRoundAcceptsMembership(
                        repo,
                        input.roundId,
                        input.overrideRoundBudget,
                    );
                }
                const isPurchaseMoved =
                    input.purchasedOn !== stored.purchasedOn;
                if (isPurchaseMoved) {
                    assertPurchaseBefore(
                        input.purchasedOn,
                        await repo.earliestLifecycleEventOn(stored.id),
                        PurchaseBound.LifecycleEvent,
                    );
                    assertPurchaseBefore(
                        input.purchasedOn,
                        await repo.earliestViolationOn(stored.id),
                        PurchaseBound.RuleViolation,
                    );
                }
                const values = editableValues(input);
                const changes = accountChanges(stored, values);
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
                        plan ?? LEDGER_ONLY_LIFECYCLE_FACTS,
                    );
                }
                await quotas.assertWithin(PropQuota.Events, 1);
                const now = new Date();
                const hasPlanKeyChange = changes.some((change) =>
                    PLAN_KEY_FIELDS.has(change.field),
                );
                const shouldRestampFingerprint =
                    hasPlanKeyChange || stored.planRulesFingerprint === null;
                const planRulesFingerprintValue =
                    plan === null || !shouldRestampFingerprint
                        ? undefined
                        : await planRulesFingerprint(plan);
                const [row] = await tx
                    .update(propAccount)
                    .set({
                        ...values,
                        ...(planRulesFingerprintValue !== undefined && {
                            planRulesFingerprint: planRulesFingerprintValue,
                        }),
                        updatedAt: now,
                    })
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

    upgradeToModeled: mutation
        .input(accountUpgradeSchema)
        .output(propAccountOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountOrThrow(
                    input.id,
                    true,
                );
                const plan = resolvedPlanOrThrow({ ...input, readIssues: [] });
                const upgraded = upgradedAccount(stored, input);
                const values = upgradedValues(upgraded);
                const changes = accountChanges(stored, values);
                if (stored.tracking === AccountTracking.Modeled) {
                    if (changes.length === 0) return stored;
                    throw new PropMutationRejectionError(
                        PropMutationRejection.TrackingChange,
                        `Account "${stored.label}" is already modeled; change its plan on the edit page instead`,
                    );
                }
                assertStageOffered(stored, plan);
                assertLiveStartsDocumented([
                    { account: values, label: stored.label, plan },
                ]);
                await assertUpgradeKeepsAccount(repo, stored, input, plan);
                await assertStoredSnapshotsFit(
                    repo,
                    tx,
                    ctx.userId,
                    upgraded,
                    plan,
                );
                await assertFundedBeforeLifecycle(repo, stored, plan);
                await quotas.assertWithin(PropQuota.Events, 1);
                const now = new Date();
                const planRulesFingerprintValue =
                    await planRulesFingerprint(plan);
                const [row] = await tx
                    .update(propAccount)
                    .set({
                        ...values,
                        planRulesFingerprint: planRulesFingerprintValue,
                        updatedAt: now,
                    })
                    .where(ownedAccount(stored.id, ctx.userId))
                    .returning();
                await repo.recordEdits(
                    [
                        {
                            accountId: stored.id,
                            changes,
                            purchasedOn: stored.purchasedOn,
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
    values: EditableValues,
): AccountEventChange[] {
    return EDITABLE_FIELDS.flatMap((field) => {
        const from = changeValue(stored[field]);
        const to = changeValue(values[field]);
        return from === to ? [] : [{ field, from, to }];
    });
}

function assertCopyGroupsModeled(rows: readonly AccountCreateInput[]): void {
    for (const row of rows) {
        if (row.copyGroupId !== null) {
            assertModeledForOperation(row, ModeledOperation.CopyGroup);
        }
    }
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
    facts: Pick<PlanLifecycleFacts, 'isInstantFunded'>,
): Promise<void> {
    const impliedPassOn = await impliedPassBound(repo, account, facts);
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

async function assertOwnedCopyGroupAcceptsStages(
    repo: PropAccountRepo,
    copyGroupId: string,
    joiningStages: readonly AccountStage[],
    movingAccountId: null | string,
): Promise<void> {
    await ownedReferenceOrThrow(
        () =>
            assertCopyGroupAcceptsStages(
                repo,
                copyGroupId,
                joiningStages,
                movingAccountId,
            ),
        COPY_GROUP_NOT_OWNED,
    );
}

function assertPurchaseBefore(
    purchasedOn: string,
    earliestOn: null | string,
    bound: PurchaseBound,
): void {
    if (earliestOn !== null && compareText(earliestOn, purchasedOn) < 0) {
        throw new PropMutationRejectionError(
            PropMutationRejection.OutOfOrderEvent,
            `The purchase date ${purchasedOn} is after the first recorded ${bound} on ${earliestOn}; pick a purchase date on or before it`,
        );
    }
}

async function assertReplacedAccountsOwned(
    repo: PropAccountRepo,
    ids: readonly string[],
): Promise<void> {
    await ownedReferenceOrThrow(
        () => repo.loadOwnedAccountsOrThrow(ids),
        REPLACED_ACCOUNT_NOT_OWNED,
    );
}

function assertStageOffered(stored: OwnedAccount, plan: Plan): void {
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
}

function assertStageStillOffered(
    stored: OwnedAccount,
    input: ModeledUpdateInput,
): Plan {
    const plan = resolvedPlanOrThrow(input);
    assertStageOffered(stored, plan);
    return plan;
}

function assertTrackingKept(
    stored: OwnedAccount,
    input: AccountUpdateInput,
): void {
    if (stored.tracking === input.tracking) return;
    throw new PropMutationRejectionError(
        PropMutationRejection.TrackingChange,
        stored.tracking === AccountTracking.LedgerOnly
            ? `Account "${stored.label}" is ledger-only; upgrade it to a modeled plan instead of editing its plan`
            : `Account "${stored.label}" is modeled and cannot be turned into a ledger-only account`,
    );
}

async function assertUpgradeKeepsAccount(
    repo: PropAccountRepo,
    stored: OwnedAccount,
    input: AccountUpgradeInput,
    plan: Plan,
): Promise<void> {
    if (input.confirmSizeOrFirmChange) return;
    const changes = upgradeChanges(stored, input);
    if (changes.length === 0) return;
    const externalFirms =
        stored.externalFirmId === null
            ? []
            : [await repo.loadOwnedExternalFirmOrThrow(stored.externalFirmId)];
    throw new PropMutationRejectionError(
        PropMutationRejection.UpgradeChangesAccount,
        `Upgrading "${stored.label}" to ${plan.label} changes ${changes.map((change) => upgradeChangeText(change, externalFirms)).join(' and ')}; confirm the change to go ahead`,
    );
}

function changeValue(value: unknown): AccountEventChangeValue {
    return value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string'
        ? value
        : stableJson(value);
}

function createdLiveStartEntries(
    rows: readonly AccountCreateInput[],
): LiveStartEntry[] {
    return rows.flatMap((row) =>
        row.tracking === AccountTracking.Modeled
            ? [
                  {
                      account: row,
                      label: row.label,
                      plan: resolvedPlanOrThrow({ ...row, readIssues: [] }),
                  },
              ]
            : [],
    );
}

function editableValues(input: AccountInput): EditableValues {
    const details = {
        copyGroupId: input.copyGroupId,
        dashboardConvention: input.dashboardConvention,
        externalAlias: input.externalAlias,
        firstFundedTradeOn: input.firstFundedTradeOn,
        fundedOn: input.fundedOn,
        label: input.label,
        liveStartBalanceCents: input.liveStartBalanceCents,
        notes: input.notes,
        personalRules: input.personalRules,
        purchasedOn: input.purchasedOn,
        replacesAccountId: input.replacesAccountId,
        roundId: input.roundId,
        tags: input.tags,
    };
    switch (input.tracking) {
        case AccountTracking.LedgerOnly: {
            return {
                ...details,
                accountSize: input.accountSize,
                externalFirmId: input.externalFirmId,
                firmId: input.firmId,
                optIns: input.optIns,
                planLabel: input.planLabel,
                planSerial: null,
                tracking: input.tracking,
            };
        }
        case AccountTracking.Modeled: {
            return {
                ...details,
                accountSize: input.accountSize,
                externalFirmId: null,
                firmId: input.firmId,
                optIns: input.optIns,
                planLabel: null,
                planSerial: input.planSerial,
                tracking: input.tracking,
            };
        }
    }
}

function externalFirmIdsOf(rows: readonly AccountInput[]): ReadonlySet<string> {
    return new Set(
        rows.flatMap((row) =>
            row.tracking === AccountTracking.LedgerOnly &&
            row.externalFirmId !== null
                ? [row.externalFirmId]
                : [],
        ),
    );
}

async function insertAccounts(
    tx: PropDatabase,
    userId: string,
    quotas: PropQuotaGuard,
    rows: readonly AccountCreateInput[],
): Promise<OwnedAccount[]> {
    const repo = new PropAccountRepo(tx, userId);
    await assertExternalFirmOwned(repo, externalFirmIdsOf(rows));
    await assertReplacedAccountsOwned(
        repo,
        rows.flatMap((row) =>
            row.replacesAccountId === null ? [] : [row.replacesAccountId],
        ),
    );
    const roundIds = new Set(
        rows.flatMap((row) => (row.roundId === null ? [] : [row.roundId])),
    );
    for (const roundId of roundIds) {
        const round = await loadOpenOwnedRoundOrThrow(repo, roundId);
        const hasEveryRowOverride = rows
            .filter((row) => row.roundId === roundId)
            .every((row) => row.overrideRoundBudget);
        if (!hasEveryRowOverride) {
            await assertRoundWithinBudget(repo, round);
        }
    }
    const groupIds = new Set(
        rows.flatMap((row) =>
            row.copyGroupId === null ? [] : [row.copyGroupId],
        ),
    );
    for (const groupId of groupIds) {
        await assertOwnedCopyGroupAcceptsStages(
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
    const fingerprints = await Promise.all(rows.map(rowPlanRulesFingerprint));
    const created = await tx
        .insert(propAccount)
        .values(
            rows.map((row, index) => ({
                ...editableValues(row),
                planRulesFingerprint: fingerprints[index] ?? null,
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

async function rowPlanRulesFingerprint(
    row: AccountCreateInput,
): Promise<null | string> {
    return row.tracking === AccountTracking.Modeled
        ? planRulesFingerprint(resolvedPlanOrThrow({ ...row, readIssues: [] }))
        : null;
}

function upgradedAccount(
    stored: OwnedAccount,
    input: AccountUpgradeInput,
): OwnedAccount {
    return {
        ...stored,
        accountSize: input.accountSize,
        externalFirmId: null,
        firmId: input.firmId,
        optIns: planOptInsSchema.parse(input.optIns),
        planLabel: null,
        planSerial: input.planSerial,
        tracking: AccountTracking.Modeled,
    };
}

function upgradedValues(upgraded: OwnedAccount): EditableValues {
    return {
        accountSize: upgraded.accountSize,
        copyGroupId: upgraded.copyGroupId,
        dashboardConvention: upgraded.dashboardConvention,
        externalAlias: upgraded.externalAlias,
        externalFirmId: upgraded.externalFirmId,
        firmId: upgraded.firmId,
        firstFundedTradeOn: upgraded.firstFundedTradeOn,
        fundedOn: upgraded.fundedOn,
        label: upgraded.label,
        liveStartBalanceCents: upgraded.liveStartBalanceCents,
        notes: upgraded.notes,
        optIns: upgraded.optIns,
        personalRules: upgraded.personalRules,
        planLabel: upgraded.planLabel,
        planSerial: upgraded.planSerial,
        purchasedOn: upgraded.purchasedOn,
        replacesAccountId: upgraded.replacesAccountId,
        roundId: upgraded.roundId,
        tags: upgraded.tags,
        tracking: upgraded.tracking,
    };
}
