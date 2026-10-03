import { z } from 'zod';

import {
    CorrelationMode,
    dollarsSchema,
    FirmId,
    fraction,
    type Fraction0to1,
    InstrumentSymbol,
    LiveTransferContinuationKind,
    type MultiAccountResult,
    type PlanOptIns,
    RungSizing,
} from '~/lib/prop-calculator';
import {
    type Assumption,
    AssumptionKind,
    assumptionSchema,
    type CumulativePayoutTriggerAssumption,
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
    type EnginePolicy,
    enginePolicySchema,
    type LiveTransferHazardAssumption,
    rulebookSchema,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    type CopySplitFundedSizing,
    CopySplitFundedSource,
    type CopySplitRefusedRow,
    type CopySplitResult,
    CopySplitRowKind,
    type CopySplitSimulatedRow,
} from '~/lib/prop-calculator/advisor/policy';
import {
    FUNDED_VALUE_SAMPLE_RANGE_LABEL,
    type FundedValueEstimateResult,
    type FundedValueSampleRange,
    type ValueChainResult,
    type ValueChainStep,
    type ValueChainStepFailure,
    ValueChainStepKind,
    type ValueNotModeledResult,
    type ValueResult,
    ValueResultKind,
    ValueUnavailableReason,
} from '~/lib/prop-calculator/advisor/value';
import {
    BankrollLeverKind,
    BankrollLeverLabel,
    EconomicsReason,
    type ProjectionMonthEnd,
} from '~/lib/prop-calculator/economics';
import {
    type BankrollPolicy,
    type BankrollTimelineResult,
} from '~/lib/prop-calculator/portfolioTimeline';
import { type UncertainValue } from '~/lib/prop-calculator/stats';
import { dayStopRuleSchema } from '~/lib/schemas/url';

export enum ToolsRequestKind {
    Batch = 'batch',
    CopySplit = 'copy-split',
    FundedValueEstimate = 'funded-value-estimate',
    Lab = 'lab',
    Levers = 'levers',
    NextRound = 'next-round',
    Projection = 'projection',
    SameEv = 'same-ev',
    SpendPayoutCurve = 'spend-payout-curve',
    TakeProfitRows = 'take-profit-rows',
    TwoStrategies = 'two-strategies',
    ValueChain = 'value-chain',
}

export enum ToolsResponseKind {
    Batch = 'batch',
    CopySplit = 'copy-split',
    Failed = 'failed',
    FundedValueEstimate = 'funded-value-estimate',
    Lab = 'lab',
    Levers = 'levers',
    NextRound = 'next-round',
    Projection = 'projection',
    SameEv = 'same-ev',
    SpendPayoutCurve = 'spend-payout-curve',
    TakeProfitRows = 'take-profit-rows',
    TwoStrategies = 'two-strategies',
    ValueChain = 'value-chain',
}

export interface BankrollBaseInputs {
    readonly commissionPerRoundTrip?: number;
    readonly dayStop?: z.infer<typeof dayStopRuleSchema>;
    readonly fundedHorizonDays: number;
    readonly fundedRiskPerTrade?: number;
    readonly fundedRrRatio?: number;
    readonly fundedTradesPerDay?: number;
    readonly idleDayProbability?: number;
    readonly instrument?: InstrumentSymbol;
    readonly maxEvalDays: number;
    readonly minRetainedCushion?: number;
    readonly riskPerTrade: number;
    readonly rrRatio: number;
    readonly seed: number;
    readonly stopPoints?: number;
    readonly tradesPerDay: number;
    readonly trials: number;
    readonly winrate: number;
}

export interface BankrollLeverRowSummary {
    readonly deltaAttemptPaysProbability?: number;
    readonly deltaEvPerAttempt: number;
    readonly deltaLossProbability?: null | number;
    readonly deltaMonthlyNet: number;
    readonly deltaPassProbability: number;
    readonly evPerAttempt: number;
    readonly kind: BankrollLeverKind;
    readonly label: BankrollLeverLabel | null;
    readonly lossRisk: null | number;
    readonly monthlyNet: number;
    readonly passProbability: number;
    readonly value: null | number;
}

export interface BankrollPlanReference {
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
}

export interface BankrollPlanVariantInputs {
    readonly base: BankrollBaseInputs;
    readonly plan: BankrollPlanReference;
    readonly policy: EnginePolicy;
}

export interface BatchToolsRequest {
    readonly attempts: number;
    readonly kind: ToolsRequestKind.Batch;
    readonly runId: number;
    readonly variant: BankrollPlanVariantInputs;
}

export interface BatchToolsResult {
    readonly kind: ToolsResponseKind.Batch;
    readonly result: BatchToolsSummary;
    readonly runId: number;
}

export interface BatchToolsSummary {
    readonly crossCheckLossProbability: null | number;
    readonly fundedValueToAttemptCostRatio: null | number;
    readonly lossProbability: null | number;
    readonly lossProbabilityReason: EconomicsReason | null;
    readonly lossProbabilityStandardError: null | number;
    readonly meanNet: null | number;
}

export interface CopySplitToolsRequest {
    readonly funded: CopySplitFundedSizing;
    readonly kind: ToolsRequestKind.CopySplit;
    readonly objective: SizingObjective;
    readonly runId: number;
    readonly splits: readonly number[];
    readonly totalRisk: number;
    readonly variant: BankrollPlanVariantInputs;
}

export interface CopySplitToolsResult {
    readonly kind: ToolsResponseKind.CopySplit;
    readonly result: CopySplitResult;
    readonly runId: number;
}

export interface FundedValueEstimateToolsRequest {
    readonly kind: ToolsRequestKind.FundedValueEstimate;
    readonly plan: BankrollPlanReference;
    readonly runId: number;
    readonly sampleSize: null | number;
    readonly spec: DocumentedPolicySpec;
}

export interface FundedValueEstimateToolsResult {
    readonly kind: ToolsResponseKind.FundedValueEstimate;
    readonly result: FundedValueEstimateResult;
    readonly runId: number;
}

export interface LabRunInputs {
    readonly activationDiscountPercent: number;
    readonly commissionPerRoundTrip: number;
    readonly discountPercent: number;
    readonly fundedHorizonDays: number;
    readonly linkActivationDiscount: boolean;
    readonly liveTransferHazard?: number;
    readonly maxEvalDays: number;
    readonly minRetainedCushion?: number;
    readonly monthlySubscriptionDiscountPercent: number;
    readonly payoutRequestSize?: number;
    readonly plan: BankrollPlanReference;
    readonly resetDiscountPercent: number;
    readonly rungSizing?: RungSizing;
    readonly seed: number;
}

export interface LabScenarioInputs {
    readonly accounts: number;
    readonly correlation: CorrelationMode;
    readonly dayStop: z.infer<typeof dayStopRuleSchema>;
    readonly groups: number;
    readonly instrument: InstrumentSymbol | null;
    readonly riskPerTrade: number;
    readonly rrRatio: number;
    readonly stopPoints: null | number;
    readonly tradesPerDay: number;
    readonly winrate: number;
}

export type LabScenarioResult = LabTheoreticalPass &
    MultiAccountResult & {
        lifetimeCapPoolingGap: null | string;
        noTransferMonthlyNet: null | number;
    };

export type LabTheoreticalPass =
    | {
          theoreticalPassProb: Fraction0to1;
          theoreticalPassReason: undefined;
      }
    | {
          theoreticalPassProb: undefined;
          theoreticalPassReason: EconomicsReason;
      };

export interface LabToolsRequest {
    readonly kind: ToolsRequestKind.Lab;
    readonly run: LabRunInputs;
    readonly runId: number;
    readonly scenario: LabScenarioInputs;
}

export interface LabToolsResult {
    readonly kind: ToolsResponseKind.Lab;
    readonly result: LabScenarioResult;
    readonly runId: number;
}

export interface LeversToolsRequest {
    readonly bankroll: number;
    readonly kind: ToolsRequestKind.Levers;
    readonly requestSizes: null | readonly number[];
    readonly risks: null | readonly number[];
    readonly runId: number;
    readonly tradesPerDay: null | readonly number[];
    readonly variant: BankrollPlanVariantInputs;
}

export interface LeversToolsResult {
    readonly kind: ToolsResponseKind.Levers;
    readonly rows: readonly BankrollLeverRowSummary[];
    readonly runId: number;
}

export interface NextRoundToolsRequest {
    readonly dayBudget: number;
    readonly kind: ToolsRequestKind.NextRound;
    readonly optionA: BankrollPolicy;
    readonly optionB: BankrollPolicy;
    readonly runId: number;
    readonly trials: number;
    readonly variant: BankrollPlanVariantInputs;
}

export interface NextRoundToolsResult {
    readonly kind: ToolsResponseKind.NextRound;
    readonly optionA: BankrollTimelineResult;
    readonly optionB: BankrollTimelineResult;
    readonly runId: number;
}

export interface ProjectionToolsRequest {
    readonly bankroll: BankrollPolicy;
    readonly dayBudget: number;
    readonly kind: ToolsRequestKind.Projection;
    readonly runId: number;
    readonly variant: BankrollPlanVariantInputs;
}

export interface ProjectionToolsResult {
    readonly kind: ToolsResponseKind.Projection;
    readonly monthEnds: readonly ProjectionMonthEnd[];
    readonly result: BankrollTimelineResult;
    readonly runId: number;
}

export interface SameEvOutcome {
    readonly evPerAttempt: number;
    readonly evPerAttemptStandardError: null | number;
    readonly lossRisk: null | number;
    readonly noPayoutProbability: null | number;
}

export interface SameEvToolsRequest {
    readonly bankroll: number;
    readonly kind: ToolsRequestKind.SameEv;
    readonly runId: number;
    readonly variants: readonly [
        BankrollPlanVariantInputs,
        BankrollPlanVariantInputs,
    ];
}

export interface SameEvToolsResult {
    readonly kind: ToolsResponseKind.SameEv;
    readonly results: readonly [SameEvOutcome, SameEvOutcome];
    readonly runId: number;
}

export interface SpendPayoutCurveFigures {
    readonly attempts: number;
    readonly expectedNet: number;
    readonly expectedPayouts: number;
    readonly expectedSpend: number;
    readonly lossProbability: number;
    readonly lossProbabilityStandardError: null | number;
    readonly netP10: number;
    readonly netP90: number;
}

export interface SpendPayoutCurveRow {
    readonly budget: number;
    readonly figures: null | SpendPayoutCurveFigures;
    readonly reason: EconomicsReason | null;
}

export interface SpendPayoutCurveToolsRequest {
    readonly budgets: readonly number[];
    readonly kind: ToolsRequestKind.SpendPayoutCurve;
    readonly runId: number;
    readonly variant: BankrollPlanVariantInputs;
}

export interface SpendPayoutCurveToolsResult {
    readonly kind: ToolsResponseKind.SpendPayoutCurve;
    readonly rows: readonly SpendPayoutCurveRow[];
    readonly runId: number;
}

export interface TakeProfitRowsToolsRequest {
    readonly anchorRrRatio: number;
    readonly kind: ToolsRequestKind.TakeProfitRows;
    readonly rrCandidates: readonly number[];
    readonly runId: number;
    readonly variant: BankrollPlanVariantInputs;
}

export interface TakeProfitRowsToolsResult {
    readonly kind: ToolsResponseKind.TakeProfitRows;
    readonly rows: readonly TakeProfitRowSummary[];
    readonly runId: number;
}

export interface TakeProfitRowSummary {
    readonly attemptPassProbability: number;
    readonly daysToPassP50: number;
    readonly expectedMonthlyNet: number;
    readonly expectedNet: number;
    readonly label: string;
    readonly rrRatio: number;
    readonly winrate: number;
}

export interface ToolsWorkerFailure {
    readonly kind: ToolsResponseKind.Failed;
    readonly reason: string;
    readonly runId: number;
}

export type ToolsWorkerRequest =
    | BatchToolsRequest
    | CopySplitToolsRequest
    | FundedValueEstimateToolsRequest
    | LabToolsRequest
    | LeversToolsRequest
    | NextRoundToolsRequest
    | ProjectionToolsRequest
    | SameEvToolsRequest
    | SpendPayoutCurveToolsRequest
    | TakeProfitRowsToolsRequest
    | TwoStrategiesToolsRequest
    | ValueChainToolsRequest;

export type ToolsWorkerResult =
    | BatchToolsResult
    | CopySplitToolsResult
    | FundedValueEstimateToolsResult
    | LabToolsResult
    | LeversToolsResult
    | NextRoundToolsResult
    | ProjectionToolsResult
    | SameEvToolsResult
    | SpendPayoutCurveToolsResult
    | TakeProfitRowsToolsResult
    | ToolsWorkerFailure
    | TwoStrategiesToolsResult
    | ValueChainToolsResult;

export interface TwoStrategiesToolsRequest {
    readonly bankroll: BankrollPolicy;
    readonly dayBudget: number;
    readonly kind: ToolsRequestKind.TwoStrategies;
    readonly runId: number;
    readonly variants: readonly [
        BankrollPlanVariantInputs,
        BankrollPlanVariantInputs,
    ];
}

export interface TwoStrategiesToolsResult {
    readonly kind: ToolsResponseKind.TwoStrategies;
    readonly results: readonly [BankrollTimelineResult, BankrollTimelineResult];
    readonly runId: number;
}

export interface ValueChainToolsRequest {
    readonly kind: ToolsRequestKind.ValueChain;
    readonly plan: BankrollPlanReference;
    readonly runId: number;
    readonly spec: DocumentedPolicySpec;
}

export interface ValueChainToolsResult {
    readonly kind: ToolsResponseKind.ValueChain;
    readonly result: ValueChainResult;
    readonly runId: number;
}

const finiteNumberSchema = z.number();
const fractionSchema = z.number().min(0).max(1);
const nullableFiniteNumberSchema = finiteNumberSchema.nullable();
const positiveIntSchema = z.number().int().positive();
const positiveNumberSchema = finiteNumberSchema.positive();
const economicsReasonSchema = z.enum(EconomicsReason).nullable();

const bankrollBaseInputsSchema = z.object({
    commissionPerRoundTrip: finiteNumberSchema.nonnegative().optional(),
    dayStop: dayStopRuleSchema.optional(),
    fundedHorizonDays: z.number().int().nonnegative(),
    fundedRiskPerTrade: finiteNumberSchema.positive().optional(),
    fundedRrRatio: finiteNumberSchema.positive().optional(),
    fundedTradesPerDay: z.number().int().positive().optional(),
    idleDayProbability: fractionSchema.optional(),
    instrument: z.enum(InstrumentSymbol).optional(),
    maxEvalDays: z.number().int().positive(),
    minRetainedCushion: finiteNumberSchema.nonnegative().optional(),
    riskPerTrade: finiteNumberSchema.positive(),
    rrRatio: finiteNumberSchema.positive(),
    seed: z.number().int(),
    stopPoints: finiteNumberSchema.positive().optional(),
    tradesPerDay: z.number().int().positive(),
    trials: z.number().int().positive(),
    winrate: fractionSchema,
}) satisfies z.ZodType<BankrollBaseInputs>;

const bankrollPlanReferenceSchema = z.object({
    firmId: z.enum(FirmId),
    optIns: z.object({
        takesFundedReset: z.boolean(),
        takesOneTimeEarlyWithdrawal: z.boolean(),
    }),
    planSerial: z.string().min(1),
}) satisfies z.ZodType<BankrollPlanReference>;

const bankrollPlanVariantInputsSchema = z.object({
    base: bankrollBaseInputsSchema,
    plan: bankrollPlanReferenceSchema,
    policy: enginePolicySchema,
}) satisfies z.ZodType<BankrollPlanVariantInputs>;

const labRunInputsSchema = z.object({
    activationDiscountPercent: finiteNumberSchema,
    commissionPerRoundTrip: finiteNumberSchema,
    discountPercent: finiteNumberSchema,
    fundedHorizonDays: finiteNumberSchema,
    linkActivationDiscount: z.boolean(),
    liveTransferHazard: fractionSchema.optional(),
    maxEvalDays: finiteNumberSchema,
    minRetainedCushion: finiteNumberSchema.optional(),
    monthlySubscriptionDiscountPercent: finiteNumberSchema,
    payoutRequestSize: finiteNumberSchema.optional(),
    plan: bankrollPlanReferenceSchema,
    resetDiscountPercent: finiteNumberSchema,
    rungSizing: z.enum(RungSizing).optional(),
    seed: z.number().int(),
}) satisfies z.ZodType<LabRunInputs>;

const labScenarioInputsSchema = z.object({
    accounts: finiteNumberSchema,
    correlation: z.enum(CorrelationMode),
    dayStop: dayStopRuleSchema,
    groups: finiteNumberSchema,
    instrument: z.enum(InstrumentSymbol).nullable(),
    riskPerTrade: finiteNumberSchema,
    rrRatio: finiteNumberSchema,
    stopPoints: nullableFiniteNumberSchema,
    tradesPerDay: finiteNumberSchema,
    winrate: finiteNumberSchema,
}) satisfies z.ZodType<LabScenarioInputs>;

const bankrollPolicySchema = z.object({
    maxConcurrentAccounts: z.number().int().positive().nullable(),
    monthlyBudget: dollarsSchema.nullable(),
    payoutLagDays: z.number().int().nonnegative(),
    reinvestFraction: fractionSchema.transform(fraction),
    roundBudget: dollarsSchema.nullable(),
    startingBankroll: dollarsSchema,
}) satisfies z.ZodType<BankrollPolicy>;

const uncertainValueSchema = z.object({
    standardError: nullableFiniteNumberSchema,
    value: finiteNumberSchema,
}) satisfies z.ZodType<UncertainValue>;

const liveTransferAssumptionSchema = assumptionSchema.refine(
    (assumption: Assumption): assumption is LiveTransferHazardAssumption =>
        assumption.kind === AssumptionKind.LiveTransferHazard,
);

const cumulativePayoutTriggerAssumptionSchema = assumptionSchema.refine(
    (assumption: Assumption): assumption is CumulativePayoutTriggerAssumption =>
        assumption.kind === AssumptionKind.CumulativePayoutTriggerPriced,
);

const valueResultSchema = z.object({
    creditFree: uncertainValueSchema,
    creditInclusive: uncertainValueSchema,
    cumulativePayoutTrigger: cumulativePayoutTriggerAssumptionSchema.optional(),
    kind: z.literal(ValueResultKind.Value),
    liveTransfer: liveTransferAssumptionSchema.optional(),
    seed: z.number().int(),
    trials: positiveIntSchema,
}) satisfies z.ZodType<ValueResult>;

const valueNotModeledResultSchema = z.object({
    kind: z.literal(ValueResultKind.NotModeled),
    reason: z.enum(ValueUnavailableReason),
}) satisfies z.ZodType<ValueNotModeledResult>;

const valueOutcomeSchema = z.discriminatedUnion('kind', [
    valueResultSchema,
    valueNotModeledResultSchema,
]);

const valueChainStepSchema = z.object({
    assumptions: z.array(z.string()),
    kind: z.enum(ValueChainStepKind),
    value: valueResultSchema,
}) satisfies z.ZodType<ValueChainStep>;

const valueChainStepFailureSchema = z.object({
    kind: z.enum(ValueChainStepKind),
    reason: z.string(),
}) satisfies z.ZodType<ValueChainStepFailure>;

const valueChainResultSchema = z.object({
    accountValue: valueOutcomeSchema.nullable(),
    failedSteps: z.array(valueChainStepFailureSchema),
    steps: z.array(valueChainStepSchema),
}) satisfies z.ZodType<ValueChainResult>;

const copySplitSimulatedRowSchema = z.object({
    cycleNet: uncertainValueSchema,
    daysToPassP50: finiteNumberSchema.nonnegative(),
    kind: z.literal(CopySplitRowKind.Simulated),
    netPerFeeDollar: nullableFiniteNumberSchema,
    passRate: fractionSchema,
    placement: z
        .object({
            contracts: z.number().int().nonnegative(),
            placedRiskPerAccount: finiteNumberSchema.nonnegative(),
        })
        .nullable(),
    riskPerAccount: positiveNumberSchema,
    splitCount: positiveIntSchema,
    totalFees: finiteNumberSchema,
    totalMonthlyNet: uncertainValueSchema,
    trials: positiveIntSchema,
}) satisfies z.ZodType<CopySplitSimulatedRow>;

const copySplitRefusedRowSchema = z.object({
    kind: z.literal(CopySplitRowKind.Refused),
    reason: z.string(),
    riskPerAccount: positiveNumberSchema,
    splitCount: positiveIntSchema,
}) satisfies z.ZodType<CopySplitRefusedRow>;

const copySplitRowSchema = z.discriminatedUnion('kind', [
    copySplitSimulatedRowSchema,
    copySplitRefusedRowSchema,
]);

const copySplitFundedSizingSchema = z.object({
    parameters: rulebookSchema.shape.funded,
    source: z.enum(CopySplitFundedSource),
}) satisfies z.ZodType<CopySplitFundedSizing>;

const copySplitResultSchema = z.object({
    basisLines: z.array(z.string()),
    indistinguishableSplits: z.array(positiveIntSchema),
    note: z.string().nullable(),
    objective: z.enum(SizingObjective),
    requestedObjective: z.enum(SizingObjective),
    rows: z.array(copySplitRowSchema),
    trialsPerSplit: positiveIntSchema,
}) satisfies z.ZodType<CopySplitResult>;

const atLeastProbabilitiesSchema = z.object({
    k1: finiteNumberSchema,
    kAll: finiteNumberSchema,
    kHalf: finiteNumberSchema,
});

const labResultFields = {
    accountsLiveTransferDistribution: z.array(finiteNumberSchema),
    accountsPassDistribution: z.array(finiteNumberSchema),
    expectedAccountsPass: finiteNumberSchema,
    expectedDaysToPass: finiteNumberSchema,
    expectedMaxLossStreak: finiteNumberSchema,
    expectedMonthlyNet: finiteNumberSchema,
    expectedMonthlyRealizedNet: finiteNumberSchema,
    expectedNet: finiteNumberSchema,
    lifetimeCapPoolingGap: z.string().nullable(),
    liveTransferContinuation: z.enum(LiveTransferContinuationKind),
    liveTransferProbability: finiteNumberSchema,
    meanTradesPerDay: finiteNumberSchema,
    noTransferMonthlyNet: nullableFiniteNumberSchema,
    pAtLeast: atLeastProbabilitiesSchema,
    pAtLeastFundedSurvival: atLeastProbabilitiesSchema,
    perAccountFundedSurvival: finiteNumberSchema,
    perAccountPass: finiteNumberSchema,
    pHitDDLimit: finiteNumberSchema,
};

const labScenarioResultSchema = z.union([
    z.object({
        ...labResultFields,
        theoreticalPassProb: fractionSchema.transform(fraction),
        theoreticalPassReason: z.undefined(),
    }),
    z.object({
        ...labResultFields,
        theoreticalPassProb: z.undefined(),
        theoreticalPassReason: z.enum(EconomicsReason),
    }),
]) satisfies z.ZodType<LabScenarioResult>;

const MAX_SPEND_PAYOUT_BUDGETS = 10;
const MAX_COPY_SPLIT_ACCOUNTS = 20;
const MAX_COPY_SPLITS = 12;

const copySplitCountsSchema = z
    .array(z.number().int().min(1).max(MAX_COPY_SPLIT_ACCOUNTS))
    .min(1)
    .max(MAX_COPY_SPLITS);

const fundedValueSampleRangeSchema = z.object({
    label: z.literal(FUNDED_VALUE_SAMPLE_RANGE_LABEL),
    lower: finiteNumberSchema,
    sampleSize: positiveIntSchema,
    upper: finiteNumberSchema,
}) satisfies z.ZodType<FundedValueSampleRange>;

const fundedValueEstimateResultSchema = z.object({
    cumulativePayoutTrigger: cumulativePayoutTriggerAssumptionSchema.optional(),
    dollarSampleRange: fundedValueSampleRangeSchema.nullable().optional(),
    fundedValue: uncertainValueSchema.optional(),
    liveTransfer: liveTransferAssumptionSchema.optional(),
    meanPayoutsPerAccount: uncertainValueSchema,
    payoutCountDistribution: z.array(fractionSchema),
    probabilityZeroPayouts: uncertainValueSchema,
    sampleRange: fundedValueSampleRangeSchema.nullable(),
    seed: z.number().int(),
    trials: positiveIntSchema,
}) satisfies z.ZodType<FundedValueEstimateResult>;

export const toolsRequestSchema = z.discriminatedUnion('kind', [
    z.object({
        attempts: z.number().int().positive(),
        kind: z.literal(ToolsRequestKind.Batch),
        runId: z.number().int(),
        variant: bankrollPlanVariantInputsSchema,
    }),
    z.object({
        funded: copySplitFundedSizingSchema,
        kind: z.literal(ToolsRequestKind.CopySplit),
        objective: z.enum(SizingObjective),
        runId: z.number().int(),
        splits: copySplitCountsSchema,
        totalRisk: positiveNumberSchema,
        variant: bankrollPlanVariantInputsSchema,
    }),
    z.object({
        kind: z.literal(ToolsRequestKind.FundedValueEstimate),
        plan: bankrollPlanReferenceSchema,
        runId: z.number().int(),
        sampleSize: positiveIntSchema.nullable(),
        spec: documentedPolicySpecSchema,
    }),
    z.object({
        kind: z.literal(ToolsRequestKind.Lab),
        run: labRunInputsSchema,
        runId: z.number().int(),
        scenario: labScenarioInputsSchema,
    }),
    z.object({
        bankroll: finiteNumberSchema.positive(),
        kind: z.literal(ToolsRequestKind.Levers),
        requestSizes: z.array(positiveNumberSchema).nullable(),
        risks: z.array(positiveNumberSchema).nullable(),
        runId: z.number().int(),
        tradesPerDay: z.array(positiveIntSchema).nullable(),
        variant: bankrollPlanVariantInputsSchema,
    }),
    z.object({
        dayBudget: z.number().int().positive(),
        kind: z.literal(ToolsRequestKind.NextRound),
        optionA: bankrollPolicySchema,
        optionB: bankrollPolicySchema,
        runId: z.number().int(),
        trials: z.number().int().positive(),
        variant: bankrollPlanVariantInputsSchema,
    }),
    z.object({
        bankroll: bankrollPolicySchema,
        dayBudget: z.number().int().positive(),
        kind: z.literal(ToolsRequestKind.Projection),
        runId: z.number().int(),
        variant: bankrollPlanVariantInputsSchema,
    }),
    z.object({
        bankroll: finiteNumberSchema.positive(),
        kind: z.literal(ToolsRequestKind.SameEv),
        runId: z.number().int(),
        variants: z.tuple([
            bankrollPlanVariantInputsSchema,
            bankrollPlanVariantInputsSchema,
        ]),
    }),
    z.object({
        budgets: z
            .array(positiveNumberSchema)
            .min(1)
            .max(MAX_SPEND_PAYOUT_BUDGETS),
        kind: z.literal(ToolsRequestKind.SpendPayoutCurve),
        runId: z.number().int(),
        variant: bankrollPlanVariantInputsSchema,
    }),
    z.object({
        anchorRrRatio: positiveNumberSchema,
        kind: z.literal(ToolsRequestKind.TakeProfitRows),
        rrCandidates: z.array(positiveNumberSchema).min(1).max(20),
        runId: z.number().int(),
        variant: bankrollPlanVariantInputsSchema,
    }),
    z.object({
        bankroll: bankrollPolicySchema,
        dayBudget: z.number().int().positive(),
        kind: z.literal(ToolsRequestKind.TwoStrategies),
        runId: z.number().int(),
        variants: z.tuple([
            bankrollPlanVariantInputsSchema,
            bankrollPlanVariantInputsSchema,
        ]),
    }),
    z.object({
        kind: z.literal(ToolsRequestKind.ValueChain),
        plan: bankrollPlanReferenceSchema,
        runId: z.number().int(),
        spec: documentedPolicySpecSchema,
    }),
]) satisfies z.ZodType<ToolsWorkerRequest>;

const bankrollTimelineResultSchema = z.object({
    cardsBoughtP50: finiteNumberSchema,
    cashP10: z.array(finiteNumberSchema),
    cashP50: z.array(finiteNumberSchema),
    cashP90: z.array(finiteNumberSchema),
    cumulativeSpendP10: z.array(finiteNumberSchema),
    cumulativeSpendP50: z.array(finiteNumberSchema),
    cumulativeSpendP90: z.array(finiteNumberSchema),
    days: z.array(z.number().int().nonnegative()),
    measuredCycleDays: nullableFiniteNumberSchema,
    pathRuin: fractionSchema.transform(fraction),
    payoutP10: z.array(finiteNumberSchema),
    payoutP50: z.array(finiteNumberSchema),
    payoutP90: z.array(finiteNumberSchema),
    pFinalNetNegative: fractionSchema.transform(fraction),
    withdrawnP10: z.array(finiteNumberSchema),
    withdrawnP50: z.array(finiteNumberSchema),
    withdrawnP90: z.array(finiteNumberSchema),
}) satisfies z.ZodType<BankrollTimelineResult>;

const projectionMonthEndSchema = z.object({
    cashP10: finiteNumberSchema,
    cashP50: finiteNumberSchema,
    cashP90: finiteNumberSchema,
    day: z.number().int().nonnegative(),
    month: positiveIntSchema,
    payoutsP50: finiteNumberSchema,
    spendP50: finiteNumberSchema,
}) satisfies z.ZodType<ProjectionMonthEnd>;

const spendPayoutCurveFiguresSchema = z.object({
    attempts: positiveIntSchema,
    expectedNet: finiteNumberSchema,
    expectedPayouts: finiteNumberSchema,
    expectedSpend: finiteNumberSchema,
    lossProbability: fractionSchema,
    lossProbabilityStandardError: nullableFiniteNumberSchema,
    netP10: finiteNumberSchema,
    netP90: finiteNumberSchema,
}) satisfies z.ZodType<SpendPayoutCurveFigures>;

const spendPayoutCurveRowSchema = z.object({
    budget: positiveNumberSchema,
    figures: spendPayoutCurveFiguresSchema.nullable(),
    reason: economicsReasonSchema,
}) satisfies z.ZodType<SpendPayoutCurveRow>;

const leverRowSummarySchema = z.object({
    deltaAttemptPaysProbability: finiteNumberSchema.optional(),
    deltaEvPerAttempt: finiteNumberSchema,
    deltaLossProbability: nullableFiniteNumberSchema.optional(),
    deltaMonthlyNet: finiteNumberSchema,
    deltaPassProbability: finiteNumberSchema,
    evPerAttempt: finiteNumberSchema,
    kind: z.enum(BankrollLeverKind),
    label: z.enum(BankrollLeverLabel).nullable(),
    lossRisk: nullableFiniteNumberSchema,
    monthlyNet: finiteNumberSchema,
    passProbability: fractionSchema,
    value: nullableFiniteNumberSchema,
}) satisfies z.ZodType<BankrollLeverRowSummary>;

const takeProfitRowSummarySchema = z.object({
    attemptPassProbability: fractionSchema,
    daysToPassP50: finiteNumberSchema.nonnegative(),
    expectedMonthlyNet: finiteNumberSchema,
    expectedNet: finiteNumberSchema,
    label: z.string(),
    rrRatio: positiveNumberSchema,
    winrate: fractionSchema,
}) satisfies z.ZodType<TakeProfitRowSummary>;

const sameEvOutcomeSchema = z.object({
    evPerAttempt: finiteNumberSchema,
    evPerAttemptStandardError: nullableFiniteNumberSchema,
    lossRisk: z.union([fractionSchema, z.null()]),
    noPayoutProbability: nullableFiniteNumberSchema,
}) satisfies z.ZodType<SameEvOutcome>;

export const toolsResultSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal(ToolsResponseKind.Batch),
        result: z.object({
            crossCheckLossProbability: nullableFiniteNumberSchema,
            fundedValueToAttemptCostRatio: nullableFiniteNumberSchema,
            lossProbability: nullableFiniteNumberSchema,
            lossProbabilityReason: economicsReasonSchema,
            lossProbabilityStandardError: nullableFiniteNumberSchema,
            meanNet: nullableFiniteNumberSchema,
        }),
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.CopySplit),
        result: copySplitResultSchema,
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.Failed),
        reason: z.string(),
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.FundedValueEstimate),
        result: fundedValueEstimateResultSchema,
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.Lab),
        result: labScenarioResultSchema,
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.Levers),
        rows: z.array(leverRowSummarySchema),
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.NextRound),
        optionA: bankrollTimelineResultSchema,
        optionB: bankrollTimelineResultSchema,
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.Projection),
        monthEnds: z.array(projectionMonthEndSchema),
        result: bankrollTimelineResultSchema,
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.SameEv),
        results: z.tuple([sameEvOutcomeSchema, sameEvOutcomeSchema]),
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.SpendPayoutCurve),
        rows: z.array(spendPayoutCurveRowSchema),
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.TakeProfitRows),
        rows: z.array(takeProfitRowSummarySchema),
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.TwoStrategies),
        results: z.tuple([
            bankrollTimelineResultSchema,
            bankrollTimelineResultSchema,
        ]),
        runId: z.number().int(),
    }),
    z.object({
        kind: z.literal(ToolsResponseKind.ValueChain),
        result: valueChainResultSchema,
        runId: z.number().int(),
    }),
]) satisfies z.ZodType<ToolsWorkerResult>;

export function parseToolsRequest(value: unknown): ToolsWorkerRequest {
    return toolsRequestSchema.parse(value);
}

export function parseToolsResult(value: unknown): ToolsWorkerResult {
    return toolsResultSchema.parse(value);
}

export function runIdOf(value: unknown): null | number {
    return typeof value === 'object' &&
        value !== null &&
        'runId' in value &&
        typeof value.runId === 'number'
        ? value.runId
        : null;
}
