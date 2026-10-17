import { z } from 'zod';

import {
    LifecycleRejection,
    nonNegativeUsdCentsSchema,
    usdCentsSchema,
} from '~/lib/prop-accounts';

export enum DpValueStateKind {
    AfterLoss = 'after-loss',
    AfterWin = 'after-win',
    Candidate = 'candidate',
    Current = 'current',
}

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

export const MAX_DP_VALUE_SAMPLES = 256;

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

const dpValueSampleSchema = z.strictObject({
    kind: z.enum(DpValueStateKind),
    rateAdjustedValueCents: z.number().int().nullable(),
    riskCents: z.number().int().nonnegative().nullable(),
    valueCents: z.number().int(),
});

export type DpValueSample = z.infer<typeof dpValueSampleSchema>;

export const dpValueSamplesSchema = z
    .array(dpValueSampleSchema)
    .max(MAX_DP_VALUE_SAMPLES);

export const propBankrollSummaryOutputSchema = z.object({
    availableCents: usdCentsSchema,
    depositsCents: nonNegativeUsdCentsSchema,
    moneyWeightedReturn: z.number().nullable(),
    reinvestedPayoutsCents: nonNegativeUsdCentsSchema,
    undatedPaidPayouts: z.number().int().nonnegative(),
    withdrawalsCents: nonNegativeUsdCentsSchema,
});

export const okOutputSchema = z.object({ ok: z.literal(true) });
