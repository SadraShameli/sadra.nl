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
import {
    AdviceSource,
    dpAdviceGapsSchema,
    dpAdviceSamplesSchema,
    DpAdviceStalenessReason,
    DpGateFailureCode,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { InstrumentSymbol } from '~/lib/prop-calculator/core';
import { dpValueSamplesSchema } from '~/lib/schemas/propAccountOutputs';
import {
    propAccount,
    propAccountEvent,
    propAccountSnapshot,
    propBankrollTransfer,
    propCopyGroup,
    propDpAdvice,
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

export const propDpAdviceOutputSchema = createSelectSchema(propDpAdvice, {
    assumedInstrument: z.enum(InstrumentSymbol).nullable(),
    assumedStopPoints: z.number().positive().nullable(),
    gaps: dpAdviceGapsSchema,
    gateFailure: z.enum(DpGateFailureCode).nullable(),
    objective: z.enum(SizingObjective),
    samples: dpAdviceSamplesSchema,
    valueSamples: dpValueSamplesSchema,
}).extend({ staleness: z.array(z.enum(DpAdviceStalenessReason)) });

export const propSavedScenarioOutputSchema =
    createSelectSchema(propSavedScenario);

export const propBankrollTransferOutputSchema = createSelectSchema(
    propBankrollTransfer,
    {
        amountCents: positiveUsdCentsSchema,
        kind: z.enum(BankrollTransferKind),
    },
);

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
