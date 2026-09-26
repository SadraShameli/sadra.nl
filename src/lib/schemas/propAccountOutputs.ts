import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    accountEventDetailSchema,
    AccountEventKind,
    type AccountReadIssue,
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    DashboardBalanceConvention,
    FeeKind,
    LifecycleRejection,
    nonNegativeUsdCentsSchema,
    PayoutStatus,
    personalRulesSchema,
    planOptInsSchema,
    positiveUsdCentsSchema,
    SnapshotSource,
    type StoredFirmId,
    UnresolvedPlanReason,
    usdCentsSchema,
} from '~/lib/prop-accounts';
import {
    propAccount,
    propAccountEvent,
    propAccountSnapshot,
    propCopyGroup,
    propFee,
    propPayout,
    propSavedScenario,
    propSizingDecision,
} from '~/server/db/schemas/prop';

export enum PropLimitRejection {
    ListTooLarge = 'list-too-large',
    QuotaExceeded = 'quota-exceeded',
}

export enum PropMutationRejection {
    DuplicateImportLabel = 'duplicate-import-label',
    LifecycleTransition = 'lifecycle-transition',
    MixedStageCopyGroup = 'mixed-stage-copy-group',
    OutOfOrderEvent = 'out-of-order-event',
    StageNotOfferedByPlan = 'stage-not-offered-by-plan',
    UnresolvablePlan = 'unresolvable-plan',
}

export enum PropQuota {
    Accounts = 'accounts',
    CopyGroups = 'copy-groups',
    Decisions = 'decisions',
    Events = 'events',
    Fees = 'fees',
    Payouts = 'payouts',
    Scenarios = 'scenarios',
    Snapshots = 'snapshots',
}

export enum PropRecord {
    Account = 'account',
    CopyGroup = 'copy group',
    Decision = 'sizing decision',
    Event = 'account event',
    Fee = 'fee',
    Payout = 'payout',
    Rulebook = 'rulebook',
    Scenario = 'saved scenario',
    Snapshot = 'snapshot',
}

export enum PropStoredRecordRejection {
    InvalidStoredRecord = 'invalid-stored-record',
}

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

export function isPropRejectionSource(
    cause: unknown,
): cause is PropRejectionSource {
    return (
        cause instanceof Error &&
        propRejectionSchema.safeParse(Reflect.get(cause, 'propRejection'))
            .success
    );
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

export const propAccountOutputSchema = createSelectSchema(propAccount, {
    dashboardConvention: z.enum(DashboardBalanceConvention),
    firmId: (storedFirmId) =>
        storedFirmId.min(1).pipe(z.custom<StoredFirmId>()),
    liveStartBalanceCents: nullableNonNegativeCents,
    optIns: planOptInsSchema,
    personalRules: personalRulesSchema,
    stage: z.enum(AccountStage),
    status: z.enum(AccountStatus),
    tags: z.array(z.string()),
}).extend({ readIssues: z.array(accountReadIssueSchema).readonly() });

export const propAccountListedOutputSchema = propAccountOutputSchema.extend({
    personalRules: personalRulesSchema.nullable(),
});

export const propAccountArchiveOutputSchema = propAccountOutputSchema.pick({
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
        stage: z.enum(AccountStage),
    },
);

export const propSavedScenarioOutputSchema =
    createSelectSchema(propSavedScenario);

export const okOutputSchema = z.object({ ok: z.literal(true) });
