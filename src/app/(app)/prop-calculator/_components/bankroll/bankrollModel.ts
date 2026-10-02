import { riskPercentToDollars } from '~/app/(app)/prop-calculator/_components/riskConversion';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { SizingMode } from '~/app/(app)/prop-calculator/_components/types';
import {
    type BankrollPlanVariantInputs,
    type BatchToolsRequest,
    type BatchToolsSummary,
    type LeversToolsRequest,
    type ProjectionToolsRequest,
    type SameEvToolsRequest,
    ToolsRequestKind,
    type TwoStrategiesToolsRequest,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import {
    CENTS_PER_DOLLAR,
    dollars,
    type Dollars,
    findFirm,
    floorToWholeCents,
    fraction,
    type Fraction0to1,
    points,
    serializePlanId,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    type EnginePolicy,
    enginePolicySchema,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    bankrollAttempts,
    bankrollCompoundingIllustration,
    bankrollLossRiskSummary,
    type BankrollMinimumBudget,
    bankrollNoPayout,
    type EconomicsEstimate,
    type EconomicsReason,
    type Quantity,
} from '~/lib/prop-calculator/economics';
import {
    type BankrollPolicy,
    type BankrollTimelineResult,
} from '~/lib/prop-calculator/portfolioTimeline';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';
import { mean } from '~/lib/prop-calculator/stats';

export const BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL =
    'deterministic illustration, not a forecast';
export const NO_POSITIVE_EDGE_TEXT =
    'no positive edge: no budget makes this safe';

export enum BankrollSetupStatus {
    NoPositiveEdge = 'no-positive-edge',
    Priced = 'priced',
}

export interface BankrollBudgetPricing {
    readonly attempts: null | number;
    readonly batchNetNegativeProbability: null | number;
    readonly batchNetNegativeReason: EconomicsReason | null;
    readonly batchNetNegativeStandardError: null | number;
    readonly noPayoutProbability: null | number;
}

export type BankrollCalculatorInputs = Pick<
    CalculatorState,
    | 'commissionPerRoundTrip'
    | 'dayStop'
    | 'fundedHorizonDays'
    | 'idleDayProbability'
    | 'instrument'
    | 'maxEvalDays'
    | 'payoutRequestSize'
    | 'plan'
    | 'retainedCushion'
    | 'riskDollars'
    | 'riskPercent'
    | 'rrRatio'
    | 'seed'
    | 'sizingMode'
    | 'stopPoints'
    | 'takesFundedReset'
    | 'takesOneTimeEarlyWithdrawal'
    | 'tradesPerDay'
    | 'trials'
    | 'winrate'
>;

export interface BankrollLeverCandidates {
    readonly requestSizes: null | readonly number[];
    readonly risks: null | readonly number[];
    readonly tradesPerDay: null | readonly number[];
}

export interface BankrollProjectionFields {
    readonly capacity: null | number;
    readonly horizonDays: number;
    readonly monthlyBudget: Dollars | null;
    readonly payoutLagDays: number;
    readonly reinvestFraction: Fraction0to1;
    readonly start: Dollars;
}

export interface BankrollProjectionSummary {
    readonly cardsBoughtMedian: number;
    readonly finalCashP10: number;
    readonly finalCashP50: number;
    readonly finalCashP90: number;
    readonly measuredCycleDays: null | number;
    readonly multiple: null | number;
    readonly pathRuin: number;
    readonly pFinalNetNegative: number;
}

export interface BankrollSetupSummary {
    readonly attemptCost: Dollars;
    readonly attemptPaysProbability: EconomicsEstimate<Fraction0to1>;
    readonly minimumBudget: Quantity<BankrollMinimumBudget>;
    readonly status: BankrollSetupStatus;
}

export function bankrollBatchRequest(
    variant: BankrollPlanVariantInputs,
    out: SimOutputs,
    budget: Dollars,
    runId: number,
): BatchToolsRequest | null {
    const attempts = bankrollAttempts(out, budget);
    return attempts === null || attempts < 1
        ? null
        : {
              attempts,
              kind: ToolsRequestKind.Batch,
              runId,
              variant,
          };
}

export function bankrollBudgetPricing(
    out: SimOutputs,
    budget: Dollars,
    batch: BatchToolsSummary | null,
): BankrollBudgetPricing {
    const attempts = bankrollAttempts(out, budget);
    if (attempts === null || attempts < 1) {
        return {
            attempts: null,
            batchNetNegativeProbability: null,
            batchNetNegativeReason: null,
            batchNetNegativeStandardError: null,
            noPayoutProbability: null,
        };
    }
    return {
        attempts,
        batchNetNegativeProbability: batch?.lossProbability ?? null,
        batchNetNegativeReason: batch?.lossProbabilityReason ?? null,
        batchNetNegativeStandardError:
            batch?.lossProbabilityStandardError ?? null,
        noPayoutProbability: bankrollNoPayout(out, attempts),
    };
}

export function bankrollClosedFormIllustration(
    start: Dollars,
    reinvestFraction: Fraction0to1,
    horizonDays: number,
): null | Quantity<Dollars> {
    return (
        bankrollCompoundingIllustration(start, reinvestFraction, horizonDays)
            ?.quantity ?? null
    );
}

export function bankrollExplicitBatchRequest(
    variant: BankrollPlanVariantInputs,
    attempts: number,
    runId: number,
): BatchToolsRequest {
    return { attempts, kind: ToolsRequestKind.Batch, runId, variant };
}

export function bankrollLeversRequest(
    variant: BankrollPlanVariantInputs,
    bankroll: Dollars,
    candidates: BankrollLeverCandidates,
    runId: number,
): LeversToolsRequest {
    return {
        bankroll,
        kind: ToolsRequestKind.Levers,
        requestSizes: candidates.requestSizes,
        risks: candidates.risks,
        runId,
        tradesPerDay: candidates.tradesPerDay,
        variant,
    };
}

export function bankrollMinimumBudgetForThreshold(
    out: SimOutputs,
    lossThreshold: Fraction0to1 | null,
): Quantity<BankrollMinimumBudget> {
    return bankrollLossRiskSummary(
        out.netValues,
        out.costPerAttempt,
        lossThreshold,
    ).minimumBudget;
}

export function bankrollProjectionRequest(
    variant: BankrollPlanVariantInputs,
    fields: BankrollProjectionFields,
    runId: number,
): ProjectionToolsRequest {
    return {
        bankroll: bankrollPolicyFromProjectionFields(fields),
        dayBudget: fields.horizonDays,
        kind: ToolsRequestKind.Projection,
        runId,
        variant,
    };
}

export function bankrollProjectionSummary(
    result: BankrollTimelineResult,
): BankrollProjectionSummary {
    const lastIndex = result.days.length - 1;
    const startCash = result.cashP50[0] ?? 0;
    const endCash = result.cashP50[lastIndex] ?? 0;
    return {
        cardsBoughtMedian: result.cardsBoughtP50,
        finalCashP10: result.cashP10[lastIndex] ?? 0,
        finalCashP50: endCash,
        finalCashP90: result.cashP90[lastIndex] ?? 0,
        measuredCycleDays: result.measuredCycleDays,
        multiple: startCash > 0 ? endCash / startCash : null,
        pathRuin: result.pathRuin,
        pFinalNetNegative: result.pFinalNetNegative,
    };
}

export function bankrollSameEvRequest(
    variants: readonly [BankrollPlanVariantInputs, BankrollPlanVariantInputs],
    bankroll: Dollars,
    runId: number,
): SameEvToolsRequest {
    return { bankroll, kind: ToolsRequestKind.SameEv, runId, variants };
}

export function bankrollSetupSummary(
    out: SimOutputs,
    lossThreshold: Fraction0to1 | null,
): BankrollSetupSummary {
    const status =
        mean(out.netValues) > 0
            ? BankrollSetupStatus.Priced
            : BankrollSetupStatus.NoPositiveEdge;
    return {
        attemptCost: dollars(out.costPerAttempt),
        attemptPaysProbability: {
            standardError: out.estimates.attemptPaysProbability.standardError,
            value: fraction(out.attemptPaysProbability),
        },
        minimumBudget: bankrollMinimumBudgetForThreshold(out, lossThreshold),
        status,
    };
}

export function bankrollTwoStrategiesRequest(
    variants: readonly [BankrollPlanVariantInputs, BankrollPlanVariantInputs],
    fields: BankrollProjectionFields,
    runId: number,
): TwoStrategiesToolsRequest {
    return {
        bankroll: bankrollPolicyFromProjectionFields(fields),
        dayBudget: fields.horizonDays,
        kind: ToolsRequestKind.TwoStrategies,
        runId,
        variants,
    };
}

export function bankrollTwoStrategiesSummary(
    results: readonly [BankrollTimelineResult, BankrollTimelineResult],
): readonly [BankrollProjectionSummary, BankrollProjectionSummary] {
    return [
        bankrollProjectionSummary(results[0]),
        bankrollProjectionSummary(results[1]),
    ];
}

export function bankrollVariantFor(
    inputs: BankrollCalculatorInputs,
    rulebook: RulebookParameters,
): BankrollPlanVariantInputs {
    const plan = withPlanOptIns(inputs.plan, {
        takesFundedReset: inputs.takesFundedReset,
        takesOneTimeEarlyWithdrawal: inputs.takesOneTimeEarlyWithdrawal,
    });
    const { policy: builtPolicy } = buildEnginePolicy({
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        fundedHorizonDays: inputs.fundedHorizonDays,
        measuredRebuyLag: null,
        plan,
        positionSizing:
            inputs.instrument === null || inputs.stopPoints === null
                ? null
                : {
                      instrument: inputs.instrument,
                      stopPoints: points(inputs.stopPoints),
                  },
        rulebook,
    });
    const effectivePayoutRequestSize =
        inputs.payoutRequestSize ??
        rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const policy: EnginePolicy = enginePolicySchema.parse({
        ...builtPolicy,
        payoutRequestOverride: effectivePayoutRequestSize,
        retainedCushionRequest:
            inputs.retainedCushion ?? builtPolicy.retainedCushionRequest,
    });
    const riskPerTrade =
        inputs.sizingMode === SizingMode.Dollar
            ? inputs.riskDollars
            : riskPercentToDollars(inputs.riskPercent, plan.accountSize);
    return {
        base: {
            commissionPerRoundTrip: inputs.commissionPerRoundTrip,
            dayStop: inputs.dayStop,
            fundedHorizonDays: inputs.fundedHorizonDays,
            idleDayProbability: inputs.idleDayProbability,
            instrument: inputs.instrument ?? undefined,
            maxEvalDays: inputs.maxEvalDays,
            riskPerTrade,
            rrRatio: inputs.rrRatio,
            seed: inputs.seed,
            stopPoints: inputs.stopPoints ?? undefined,
            tradesPerDay: inputs.tradesPerDay,
            trials: inputs.trials,
            winrate: inputs.winrate,
        },
        plan: {
            firmId: plan.id.firm,
            optIns: {
                takesFundedReset: inputs.takesFundedReset,
                takesOneTimeEarlyWithdrawal: inputs.takesOneTimeEarlyWithdrawal,
            },
            planSerial: serializePlanId(plan.id),
        },
        policy,
    };
}

export function bankrollVariantWithFundedRisk(
    variant: BankrollPlanVariantInputs,
    fundedRiskPerTrade: number,
): BankrollPlanVariantInputs {
    return { ...variant, base: { ...variant.base, fundedRiskPerTrade } };
}

export function bankrollVariantWithRisk(
    variant: BankrollPlanVariantInputs,
    riskPerTrade: number,
): BankrollPlanVariantInputs {
    return { ...variant, base: { ...variant.base, riskPerTrade } };
}

export function parseBankrollCandidateList(
    raw: string,
): null | readonly number[] {
    const values = raw
        .split(',')
        .map((piece) => piece.trim())
        .filter((piece) => piece.length > 0)
        .map(Number);
    if (values.length === 0) return null;
    return values.every((value) => Number.isFinite(value) && value > 0)
        ? values
        : null;
}

export function parseBankrollDollarCandidateList(
    raw: string,
): null | readonly number[] {
    const values = parseBankrollCandidateList(raw);
    if (values === null) return null;
    const rounded = values.map(floorToWholeCents);
    return rounded.every((value) => value > 0) ? rounded : null;
}

function bankrollPolicyFromProjectionFields(
    fields: BankrollProjectionFields,
): BankrollPolicy {
    return {
        maxConcurrentAccounts: fields.capacity,
        monthlyBudget: fields.monthlyBudget,
        payoutLagDays: fields.payoutLagDays,
        reinvestFraction: fields.reinvestFraction,
        roundBudget: null,
        startingBankroll: fields.start,
    };
}
