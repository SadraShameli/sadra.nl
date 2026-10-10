import type { EvalStateValueResult } from '~/lib/prop-calculator/core';

import {
    aggressiveOptimumChurnReasons,
    DifferenceReason,
    type DifferenceReasonDetail,
    documentedPayoutRequest,
    fundedRetainedCushionResolution,
    peakRiskOf,
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
    type SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    DP_ADVICE_SOLVER_VERSION,
    DpAdviceGap,
    type DpAdviceGapEntry,
    type DpAdviceSamples,
    type DpRiskSample,
    DpSamplesKind,
    DpSampleStage,
    DpSamplesUnavailableReason,
} from '~/lib/prop-calculator/advisor/DpAdviceRow';
import {
    type AccountState,
    CENTS_PER_DOLLAR,
    DEFAULT_RUNG_SIZING,
    dollars,
    type FirmAccountPolicy,
    isEvalDpEligible,
    PayoutRequestPolicy,
    type Plan,
    type PolicySizing,
    policySizingOf,
    type PositionSizingConfig,
    resolvePositionSizing,
    resolveRiskAt,
    type RungSizing,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { centsOf } from '~/lib/prop-calculator/core/EvalDayTopology';
import { fundedDpModelGaps } from '~/lib/prop-calculator/core/FundedDpModelGaps';
import {
    type FundedStateValueResult,
    isFundedDpEligible,
} from '~/lib/prop-calculator/core/FundedStateValue';

import {
    dpConfigKey,
    type DpFundedGrid,
    type DpSolveConfig,
} from './DpConfigKey';
import {
    DpEvalObjective,
    type DpGateCitation,
    type DpGateFailure,
    dpNotValidatedCauseOf,
    type DpValidationVerdict,
} from './DpValidationGate';

export const EVAL_CUSHION_STEP_DOLLARS_DEFAULT = 100;

export interface DpAdvice {
    readonly configKey: string;
    readonly gaps: readonly DpAdviceGapEntry[];
    readonly notValidated: DpNotValidatedDetail | null;
    readonly objective: SizingObjective;
    readonly reasons: readonly DifferenceReasonDetail[];
    readonly samples: DpAdviceSamples;
    readonly solverVersion: number;
    readonly validated: boolean;
    readonly validationRef: null | string;
}

export type DpAdviceAccount = Pick<
    ReconstructedFundedOrEvalAccount,
    'fundedTracker' | 'kind' | 'plan' | 'state'
>;

export interface DpAdviceInput {
    readonly account: DpAdviceAccount;
    readonly accountPolicy?: FirmAccountPolicy;
    readonly config: DpSolveConfig;
    readonly documentedPeakRisk: null | number;
    readonly documentedRungDollars: number;
    readonly solution: DpSolutionView;
    readonly validation: DpValidationVerdict;
}

export type DpEligibility =
    | { readonly eligible: false; readonly reason: string }
    | { readonly eligible: true };

export interface DpNotValidatedDetail {
    readonly citation: DpGateCitation | null;
    readonly failure: DpGateFailure;
    readonly result: null | string;
}

export interface DpSolutionView {
    readonly evalResult: Pick<
        EvalStateValueResult,
        'dayPolicy' | 'riskAtReachedState'
    >;
    readonly fundedResult: Pick<
        FundedStateValueResult,
        'cushionGrid' | 'dayPolicy' | 'isGridSaturated'
    >;
}

export interface DpSolveConfigInput extends Omit<
    DpSolveConfig,
    'fundedGrid' | 'planSerial'
> {
    readonly fundedGrid: Omit<
        DpFundedGrid,
        'minRetainedCushion' | 'payoutRequestPolicy' | 'payoutRequestSize'
    >;
    readonly personalPayoutRequest: null | number;
    readonly personalRetainedCushion?: number;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
}

interface PathSamplingOptions {
    readonly commission: number;
    readonly phase: TradingPhase;
    readonly plan: Plan;
    readonly positionSizing: null | PositionSizingConfig;
    readonly riskAt: (state: AccountState, tradeIndex: number) => null | number;
    readonly rungDollars: number;
    readonly rungSizing: RungSizing;
    readonly sizing: PolicySizing;
    readonly slots: number;
    readonly state: AccountState;
}

interface Sampling {
    readonly reasons: readonly DifferenceReasonDetail[];
    readonly samples: DpAdviceSamples;
}

const CAUSE_COUNTS_INVALID = 'needs a non-negative integer';
const CAUSE_LEVEL_UNREACHABLE = 'which this plan can never reach';
const SAMPLE_RUNG_OFFSETS = [-2, -1, 0, 1, 2] as const;

export function dpAdviceFor(input: DpAdviceInput): DpAdvice {
    const { account, config, validation } = input;
    const stage = stageOf(account);
    const reasons: DifferenceReasonDetail[] = [];
    if (!validation.validated) {
        const cause = dpNotValidatedCauseOf(validation.failure);
        if (cause !== null) {
            reasons.push({ cause, kind: DifferenceReason.DpNotValidated });
        }
    }
    const sampling = samplesFor(input, stage);
    reasons.push(...sampling.reasons);
    const gaps = gapsFor(input, stage);
    if (gaps.some(isGridTopGap)) {
        reasons.push({ kind: DifferenceReason.DpGridSaturation });
    }
    const misaligned = gaps.find(isEvalGridMisalignedGap);
    if (misaligned !== undefined) {
        reasons.push({
            drawdown: dollars(misaligned.drawdownCents / CENTS_PER_DOLLAR),
            kind: DifferenceReason.DpGridMisaligned,
            step: dollars(misaligned.stepCents / CENTS_PER_DOLLAR),
        });
    }
    if (sampling.samples.kind === DpSamplesKind.Sampled) {
        const optimumPeakRisk = optimumPeakRiskOf(sampling.samples.samples);
        reasons.push(
            ...aggressiveOptimumChurnReasons({
                accountPolicy: input.accountPolicy,
                documentedPeakRisk: input.documentedPeakRisk,
                optimumPeakRisk,
                plan: account.plan,
            }),
        );
    }
    return {
        configKey: dpConfigKey(config),
        gaps,
        notValidated: validation.validated
            ? null
            : {
                  citation: validation.citation,
                  failure: validation.failure,
                  result: validation.result,
              },
        objective: config.objective,
        reasons,
        samples: sampling.samples,
        solverVersion: DP_ADVICE_SOLVER_VERSION,
        validated: validation.validated,
        validationRef: validation.validated
            ? `${validation.citation.file}#${validation.citation.row}`
            : null,
    };
}

export function dpEligibility(plan: Plan): DpEligibility {
    if (plan.isInstantFunded) {
        return {
            eligible: false,
            reason: `${plan.label} is instant-funded, so there is no eval phase for the DP to solve. Use a fixed funded-phase policy sweep instead (cli prop optimize funded).`,
        };
    }
    if (!isEvalDpEligible(plan)) {
        return {
            eligible: false,
            reason: `${plan.label}: eval phase is not DP-eligible (intraday-trailing drawdown, an eval daily loss limit that scales continuously with peak-day-close profit (PeakProfitShare), or an eval tier keyed on the intraday peak (TierBasis.PeakIntradayProfit), which the eval DP does not track).`,
        };
    }
    if (!isFundedDpEligible(plan)) {
        return {
            eligible: false,
            reason: `${plan.label}: funded phase is not DP-eligible (intraday-trailing drawdown, a funded daily loss limit that scales continuously with peak-day-close profit (PeakProfitShare), no drawdown lock / ReleaseFloor payout effect, or a payout cap keyed on cumulative qualifying days (QualifyingDaysMilestonePayoutCap)).`,
        };
    }
    return { eligible: true };
}

export function dpEvalDayIndex(state: AccountState): null | number {
    const day = state.elapsedDays;
    return day !== undefined && Number.isSafeInteger(day) && day >= 0
        ? day
        : null;
}

export function dpSolveConfigFor(input: DpSolveConfigInput): DpSolveConfig {
    const {
        fundedGrid,
        personalPayoutRequest,
        personalRetainedCushion = 0,
        plan,
        rulebook,
        ...config
    } = input;
    return {
        ...config,
        fundedGrid: {
            ...fundedGrid,
            minRetainedCushion: fundedRetainedCushionResolution(
                rulebook,
                personalRetainedCushion,
            ).amount,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: documentedPayoutRequest(
                plan,
                personalPayoutRequest,
                rulebook.payout,
            ).effective,
        },
        planSerial: serializePlanId(plan.id),
    };
}

export function ineligibleDpAdvice(input: {
    readonly config: DpSolveConfig;
    readonly reason: string;
    readonly stage: DpSampleStage;
}): DpAdvice {
    const { config, reason, stage } = input;
    return {
        configKey: dpConfigKey(config),
        gaps: [],
        notValidated: null,
        objective: config.objective,
        reasons: [{ kind: DifferenceReason.DpIneligible, reason }],
        samples: unavailable(stage, DpSamplesUnavailableReason.NotEligible),
        solverVersion: DP_ADVICE_SOLVER_VERSION,
        validated: false,
        validationRef: null,
    };
}

function evalSamples(input: DpAdviceInput): Sampling {
    const { account, config, solution } = input;
    const { plan, state } = account;
    const day = dpEvalDayIndex(state);
    if (day === null) {
        return noSamples(
            DpSampleStage.Eval,
            DpSamplesUnavailableReason.EvalElapsedDaysMissing,
        );
    }
    const unreached: Sampling = {
        ...noSamples(
            DpSampleStage.Eval,
            DpSamplesUnavailableReason.EvalStateUnreached,
        ),
        reasons: [{ day, kind: DifferenceReason.DpStateUnreached }],
    };
    if (day >= plan.evalDayCap(config.maxEvalDays)) {
        return {
            ...unreached,
            samples: unavailable(
                DpSampleStage.Eval,
                DpSamplesUnavailableReason.EvalDayPastHorizon,
            ),
        };
    }
    const samples = sampleRiskPaths({
        commission: config.commission,
        phase: TradingPhase.Eval,
        plan,
        positionSizing: positionSizingOf(config),
        riskAt: (sampleState, tradeIndex) =>
            solution.evalResult.riskAtReachedState(
                { ...sampleState, elapsedDays: day },
                tradeIndex,
            ),
        rungDollars: input.documentedRungDollars,
        rungSizing: config.evalGrid.rungSizing ?? DEFAULT_RUNG_SIZING,
        sizing: policySizingOf(TradingPhase.Eval),
        slots: solution.evalResult.dayPolicy.ladder.length,
        state,
    });
    return hasBaseSample(samples)
        ? sampled(DpSampleStage.Eval, samples)
        : unreached;
}

function fundedFailureReason(
    error: unknown,
): DpSamplesUnavailableReason | null {
    const message = error instanceof Error ? error.message : '';
    if (message.includes(CAUSE_LEVEL_UNREACHABLE)) {
        return DpSamplesUnavailableReason.FundedLevelUnreachable;
    }
    return message.includes(CAUSE_COUNTS_INVALID)
        ? DpSamplesUnavailableReason.FundedCycleCountsInvalid
        : null;
}

function fundedSamples(input: DpAdviceInput): Sampling {
    const { account, config, solution } = input;
    const { plan, state } = account;
    const { computeRisk } = solution.fundedResult.dayPolicy;
    if (computeRisk === undefined) {
        throw new Error(
            `${plan.label}: the solved funded DP exposes no computeRisk to sample`,
        );
    }
    const cycle = account.fundedTracker?.cycleSnapshot(plan, state);
    try {
        return sampled(
            DpSampleStage.Funded,
            sampleRiskPaths({
                commission: config.commission,
                phase: TradingPhase.Funded,
                plan,
                positionSizing: positionSizingOf(config),
                riskAt: (sampleState, tradeIndex) =>
                    computeRisk(sampleState, tradeIndex, cycle),
                rungDollars: input.documentedRungDollars,
                rungSizing: config.fundedGrid.rungSizing ?? DEFAULT_RUNG_SIZING,
                sizing: policySizingOf(TradingPhase.Funded),
                slots: solution.fundedResult.dayPolicy.ladder.length,
                state,
            }),
        );
    } catch (error) {
        const reason = fundedFailureReason(error);
        if (reason === null) throw error;
        return noSamples(DpSampleStage.Funded, reason);
    }
}

function gapsFor(
    input: DpAdviceInput,
    stage: DpSampleStage,
): DpAdviceGapEntry[] {
    const { account, config, solution } = input;
    const { plan, state } = account;
    const gaps: DpAdviceGapEntry[] = [...fundedDpModelGaps(plan)];
    if (config.positionSizing === null) {
        gaps.push({ kind: DpAdviceGap.ContinuousRiskAssumed });
    }
    if (plan.fundedConsistencyRule() !== null) {
        gaps.push({
            kind: DpAdviceGap.ConsistencyGridTruncates,
            lockedTopCents: centsOf(
                solution.fundedResult.cushionGrid.lockedTopDollars,
            ),
        });
    }
    switch (stage) {
        case DpSampleStage.Eval: {
            const drawdown = plan.drawdownFor(TradingPhase.Eval).amount;
            const step =
                config.evalGrid.cushionStepDollars ??
                EVAL_CUSHION_STEP_DOLLARS_DEFAULT;
            if (!isWholeMultiple(drawdown, step)) {
                gaps.push({
                    drawdownCents: centsOf(drawdown),
                    kind: DpAdviceGap.EvalGridMisaligned,
                    stepCents: centsOf(step),
                });
            }
            break;
        }
        case DpSampleStage.Funded: {
            gaps.push({ kind: DpAdviceGap.DayStopRuleNotModeled });
            const cycle = account.fundedTracker?.cycleSnapshot(plan, state);
            if (solution.fundedResult.isGridSaturated(state, cycle)) {
                gaps.push({ kind: DpAdviceGap.StateAtGridTop });
            }
            break;
        }
    }
    return gaps;
}

function hasBaseSample(samples: readonly DpRiskSample[]): boolean {
    return samples.some(
        (sample) => sample.rungOffset === 0 && sample.tradeIndex === 0,
    );
}

function isEvalGridMisalignedGap(
    gap: DpAdviceGapEntry,
): gap is Extract<DpAdviceGapEntry, { kind: DpAdviceGap.EvalGridMisaligned }> {
    return gap.kind === DpAdviceGap.EvalGridMisaligned;
}

function isGridTopGap(gap: DpAdviceGapEntry): boolean {
    return gap.kind === DpAdviceGap.StateAtGridTop;
}

function isWholeMultiple(amount: number, step: number): boolean {
    const stepCents = centsOf(step);
    return stepCents > 0 && centsOf(amount) % stepCents === 0;
}

function noSamples(
    stage: DpSampleStage,
    reason: DpSamplesUnavailableReason,
): Sampling {
    return { reasons: [], samples: unavailable(stage, reason) };
}

function optimumPeakRiskOf(samples: readonly DpRiskSample[]): null | number {
    return peakRiskOf(
        samples
            .filter((sample) => sample.rungOffset === 0)
            .map(
                (sample) =>
                    (sample.placedRiskCents ?? sample.riskCents) /
                    CENTS_PER_DOLLAR,
            ),
    );
}

function positionSizingOf(config: DpSolveConfig): null | PositionSizingConfig {
    return config.positionSizing === null
        ? null
        : resolvePositionSizing(
              config.positionSizing.instrument,
              config.positionSizing.stopPoints,
          );
}

function sampled(
    stage: DpSampleStage,
    samples: readonly DpRiskSample[],
): Sampling {
    return {
        reasons: [],
        samples: { kind: DpSamplesKind.Sampled, samples, stage },
    };
}

function sampleLossPath(
    options: PathSamplingOptions,
    rungOffset: number,
): DpRiskSample[] {
    const { positionSizing, riskAt, slots } = options;
    const samples: DpRiskSample[] = [];
    let current: AccountState = {
        ...options.state,
        balance: options.state.balance + rungOffset * options.rungDollars,
    };
    for (let tradeIndex = 0; tradeIndex < slots; tradeIndex++) {
        const cushion = current.balance - current.threshold;
        const risk = cushion > 0 ? riskAt(current, tradeIndex) : null;
        if (risk === null) return samples;
        const trade = resolveRiskAt({
            commission: options.commission,
            intendedRisk: risk,
            phase: options.phase,
            plan: options.plan,
            positionSizing,
            rungSizing: options.rungSizing,
            sizing: options.sizing,
            state: current,
        });
        samples.push({
            cushionCents: centsOf(cushion),
            placedRiskCents:
                positionSizing === null ? null : centsOf(trade.rewardRisk),
            riskCents: centsOf(risk),
            rungOffset,
            tradeIndex,
        });
        current = {
            ...current,
            balance: current.balance - trade.risk,
            todayPnL: current.todayPnL - trade.risk,
        };
    }
    return samples;
}

function sampleRiskPaths(options: PathSamplingOptions): DpRiskSample[] {
    return SAMPLE_RUNG_OFFSETS.flatMap((rungOffset) =>
        sampleLossPath(options, rungOffset),
    );
}

function samplesFor(input: DpAdviceInput, stage: DpSampleStage): Sampling {
    const { validation } = input;
    switch (stage) {
        case DpSampleStage.Eval: {
            if (!validation.validated) {
                return noSamples(
                    stage,
                    DpSamplesUnavailableReason.EvalRowsSuppressed,
                );
            }
            if (validation.evalObjective !== DpEvalObjective.CashAtPass) {
                return {
                    reasons: [{ kind: DifferenceReason.DpObjectiveMismatch }],
                    samples: unavailable(
                        stage,
                        DpSamplesUnavailableReason.EvalRowsSuppressed,
                    ),
                };
            }
            return evalSamples(input);
        }
        case DpSampleStage.Funded: {
            return fundedSamples(input);
        }
    }
}

function stageOf(account: DpAdviceAccount): DpSampleStage {
    switch (account.kind) {
        case TradingPhase.Eval: {
            return DpSampleStage.Eval;
        }
        case TradingPhase.Funded: {
            return DpSampleStage.Funded;
        }
    }
}

function unavailable(
    stage: DpSampleStage,
    reason: DpSamplesUnavailableReason,
): DpAdviceSamples {
    return { kind: DpSamplesKind.Unavailable, reason, stage };
}
