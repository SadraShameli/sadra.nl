import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    accountEventDetailSchema,
    AccountEventKind,
    type AccountReadIssue,
    AccountReadIssueKind,
    accountShapeProblem,
    AccountStage,
    AccountStatus,
    AccountTracking,
    BankrollTransferKind,
    DashboardBalanceConvention,
    FeeKind,
    FirmEngagementReason,
    FirmEngagementStatus,
    LifecycleRejection,
    nonNegativeUsdCentsSchema,
    PayoutStatus,
    personalRulesSchema,
    planOptInsSchema,
    positiveUsdCentsSchema,
    ReportedPayoutBasis,
    RoundStatus,
    RuleViolationKind,
    SnapshotSource,
    type StoredFirmId,
    type TrackedColumns,
    UnresolvedPlanReason,
    usdCentsSchema,
    ViolationSource,
} from '~/lib/prop-accounts';
import { AdviceSource } from '~/lib/prop-calculator/advisor';
import {
    propAccount,
    propAccountEvent,
    propAccountSnapshot,
    propBankrollTransfer,
    propCopyGroup,
    propExternalFirm,
    propFee,
    propFirmEngagement,
    propFirmStatement,
    propPayout,
    propRound,
    propRuleViolation,
    propSavedScenario,
    propSizingDecision,
} from '~/server/db/schemas/prop';

export enum PropLimitRejection {
    ListTooLarge = 'list-too-large',
    QuotaExceeded = 'quota-exceeded',
}

export enum PropMutationRejection {
    DecisionOfOtherAccount = 'decision-of-other-account',
    DuplicateImportLabel = 'duplicate-import-label',
    DuplicateSnapshot = 'duplicate-snapshot',
    ExclusivityNotConfirmed = 'exclusivity-not-confirmed',
    FutureDate = 'future-date',
    ImplausibleSnapshot = 'implausible-snapshot',
    LifecycleTransition = 'lifecycle-transition',
    MissingSnapshotField = 'missing-snapshot-field',
    MixedStageCopyGroup = 'mixed-stage-copy-group',
    NotModeledForOperation = 'not-modeled-for-operation',
    OutOfOrderEvent = 'out-of-order-event',
    RecordInUse = 'record-in-use',
    ReferenceNotOwned = 'reference-not-owned',
    RoundBudgetExceeded = 'round-budget-exceeded',
    RoundClosed = 'round-closed',
    StageMismatch = 'stage-mismatch',
    StageNotOfferedByPlan = 'stage-not-offered-by-plan',
    TrackingChange = 'tracking-change',
    UnresolvablePlan = 'unresolvable-plan',
    UpgradeChangesAccount = 'upgrade-changes-account',
}

export enum PropQuota {
    Accounts = 'accounts',
    BankrollTransfers = 'bankroll-transfers',
    CopyGroups = 'copy-groups',
    Decisions = 'decisions',
    Events = 'events',
    ExternalFirms = 'external-firms',
    Fees = 'fees',
    FirmEngagements = 'firm-engagements',
    FirmStatements = 'firm-statements',
    Payouts = 'payouts',
    Rounds = 'rounds',
    Scenarios = 'scenarios',
    Snapshots = 'snapshots',
    Violations = 'violations',
}

export enum PropRecord {
    Account = 'account',
    BankrollTransfer = 'bankroll transfer',
    CopyGroup = 'copy group',
    Decision = 'sizing decision',
    Event = 'account event',
    ExternalFirm = 'external firm',
    Fee = 'fee',
    FirmEngagement = 'firm status',
    FirmStatement = 'firm statement',
    Payout = 'payout',
    Round = 'round',
    Rulebook = 'rulebook',
    Scenario = 'saved scenario',
    Snapshot = 'snapshot',
    Violation = 'rule violation',
}

export enum PropStoredRecordRejection {
    InvalidStoredRecord = 'invalid-stored-record',
}

export const MAX_SAVED_SCENARIOS = 100;

export const STORED_DATA_OWNER_REPAIR =
    'Ask the site owner to repair the stored data, which loses nothing';

export const propRejectionSchema = z.object({
    lifecycleRejection: z.enum(LifecycleRejection).nullable(),
    limit: z.number().int().nonnegative().nullable(),
    quota: z.enum(PropQuota).nullable(),
    reason: z.union([
        z.enum(PropMutationRejection),
        z.enum(PropLimitRejection),
        z.enum(PropStoredRecordRejection),
    ]),
    record: z.enum(PropRecord).nullable(),
    recordId: z.string().nullable(),
});

export type PropRejection = z.infer<typeof propRejectionSchema>;

export interface PropRejectionSource {
    readonly propRejection: PropRejection;
}

export function isInvalidStoredRecord(
    error: unknown,
    record: PropRecord,
): boolean {
    const rejection = propRejectionOf(error);
    return (
        rejection?.reason === PropStoredRecordRejection.InvalidStoredRecord &&
        rejection.record === record
    );
}

export function isPropRejectionSource(
    cause: unknown,
): cause is PropRejectionSource {
    return (
        cause instanceof Error &&
        propRejectionSchema.safeParse(Reflect.get(cause, 'propRejection'))
            .success
    );
}

export function propRejectionOf(error: unknown): null | PropRejection {
    if (!(error instanceof Error)) return null;
    const data: unknown = Reflect.get(error, 'data');
    if (typeof data !== 'object' || data === null) return null;
    const rejection = propRejectionSchema.safeParse(
        Reflect.get(data, 'propRejection'),
    );
    return rejection.success ? rejection.data : null;
}

function storedFirmIdOf(column: z.ZodString) {
    return column.min(1).pipe(z.custom<StoredFirmId>());
}

const nullableCents = usdCentsSchema.nullable();
const nullableNonNegativeCents = nonNegativeUsdCentsSchema.nullable();

const accountReadIssueSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal(AccountReadIssueKind.CorruptPersonalRules) }),
    z.object({
        kind: z.literal(AccountReadIssueKind.UnresolvablePlan),
        reason: z.enum(UnresolvedPlanReason),
    }),
]) satisfies z.ZodType<AccountReadIssue>;

function refineTrackedShape(
    account: TrackedColumns,
    context: z.RefinementCtx,
): void {
    const problem = accountShapeProblem(account);
    if (problem !== null) {
        context.addIssue({
            code: 'custom',
            message: `the stored account ${problem}`,
            path: ['tracking'],
        });
    }
}

const propAccountStoredSchema = createSelectSchema(propAccount, {
    dashboardConvention: z.enum(DashboardBalanceConvention),
    firmId: storedFirmIdOf,
    liveStartBalanceCents: nullableNonNegativeCents,
    optIns: planOptInsSchema,
    personalRules: personalRulesSchema,
    stage: z.enum(AccountStage),
    status: z.enum(AccountStatus),
    tags: z.array(z.string()),
    tracking: z.enum(AccountTracking),
}).extend({
    currentPlanRulesFingerprint: z.string().nullable().default(null),
    hasCorruptTags: z.boolean().optional(),
    planRulesChanged: z.boolean().nullable().default(null),
    readIssues: z.array(accountReadIssueSchema).readonly(),
});

export const propAccountOutputSchema =
    propAccountStoredSchema.superRefine(refineTrackedShape);

export const propAccountListedOutputSchema = propAccountStoredSchema
    .extend({ personalRules: personalRulesSchema.nullable() })
    .superRefine(refineTrackedShape);

export const propAccountArchiveOutputSchema = propAccountStoredSchema.pick({
    archivedAt: true,
    id: true,
});

export const propAccountSnapshotOutputSchema = createSelectSchema(
    propAccountSnapshot,
    {
        balanceAtLastPayoutCents: nullableCents,
        balanceCents: usdCentsSchema,
        cumulativePayoutCents: nullableNonNegativeCents,
        cycleBestDayProfitCents: nullableNonNegativeCents,
        dashboardFloorCents: nullableCents,
        evalBestDayProfitCents: nullableNonNegativeCents,
        floorAtLastPayoutCents: nullableCents,
        highestEodBalanceCents: nullableCents,
        highestIntradayBalanceCents: nullableCents,
        source: z.enum(SnapshotSource),
    },
);

export const propPayoutOutputSchema = createSelectSchema(propPayout, {
    grossCents: positiveUsdCentsSchema,
    netCents: nullableNonNegativeCents,
    status: z.enum(PayoutStatus),
});

export const propFeeOutputSchema = createSelectSchema(propFee, {
    amountCents: nonNegativeUsdCentsSchema,
    kind: z.enum(FeeKind),
});

export const propAccountEventOutputSchema = createSelectSchema(
    propAccountEvent,
    {
        detail: accountEventDetailSchema,
        kind: z.enum(AccountEventKind),
    },
);

export const propCopyGroupOutputSchema = createSelectSchema(propCopyGroup);

export const propSizingDecisionOutputSchema = createSelectSchema(
    propSizingDecision,
    {
        acceptedRiskCents: nonNegativeUsdCentsSchema,
        acceptedRungsCents: z.array(positiveUsdCentsSchema),
        actualRiskCents: nullableNonNegativeCents,
        headlineRiskCents: nonNegativeUsdCentsSchema,
        source: z.enum(AdviceSource),
        stage: z.enum(AccountStage),
    },
);

export const propSavedScenarioOutputSchema =
    createSelectSchema(propSavedScenario);

export const propBankrollTransferOutputSchema = createSelectSchema(
    propBankrollTransfer,
    {
        amountCents: positiveUsdCentsSchema,
        kind: z.enum(BankrollTransferKind),
    },
);

export const propBankrollSummaryOutputSchema = z.object({
    availableCents: usdCentsSchema,
    depositsCents: nonNegativeUsdCentsSchema,
    moneyWeightedReturn: z.number().nullable(),
    reinvestedPayoutsCents: nonNegativeUsdCentsSchema,
    undatedPaidPayouts: z.number().int().nonnegative(),
    withdrawalsCents: nonNegativeUsdCentsSchema,
});

export const propExternalFirmOutputSchema =
    createSelectSchema(propExternalFirm);

export const propRoundOutputSchema = createSelectSchema(propRound, {
    budgetCents: positiveUsdCentsSchema.nullable(),
    firmId: storedFirmIdOf,
    status: z.enum(RoundStatus),
});

export const propFirmEngagementOutputSchema = createSelectSchema(
    propFirmEngagement,
    {
        firmId: storedFirmIdOf,
        reason: z.enum(FirmEngagementReason).nullable(),
        status: z.enum(FirmEngagementStatus),
    },
);

export const propFirmStatementOutputSchema = createSelectSchema(
    propFirmStatement,
    {
        basis: z.enum(ReportedPayoutBasis),
        firmId: storedFirmIdOf,
        reportedPayoutCents: nonNegativeUsdCentsSchema,
    },
);

export const propRuleViolationOutputSchema = createSelectSchema(
    propRuleViolation,
    {
        costCents: nullableCents,
        kind: z.enum(RuleViolationKind),
        source: z.enum(ViolationSource),
    },
);

export const okOutputSchema = z.object({ ok: z.literal(true) });
