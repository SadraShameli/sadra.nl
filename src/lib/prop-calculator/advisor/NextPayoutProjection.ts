import {
    CALENDAR_DAYS_PER_WEEK,
    DEFAULT_RUNG_SIZING,
    dollars,
    fraction,
    PayoutEvaluationKind,
    type Plan,
    resolvePositionSizing,
    restoreFundedCycleTracker,
    SESSION_DAYS_PER_CALENDAR_WEEK,
    TradingPhase,
} from '../core';
import { mulberry32 } from '../rng';
import {
    type FundedSimStart,
    FundedStage,
    LossStreak,
    newPhaseStats,
    PayoutTotals,
    resolveDayPolicy,
    runFundedDays,
    SIM_DEFAULTS,
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputs,
    simStartIssue,
    TradeTotals,
} from '../simulator';
import {
    binomialStandardError,
    meanStandardError,
    type UncertainValue,
} from '../stats';
import { type AdviceSource } from './AdviceSource';
import { applyEnginePolicy } from './EnginePolicyBuilder';
import { type EnginePolicy } from './policy';

export interface NextPayoutProjection {
    readonly accountLostBeforeFirstPayoutProbability: null | number;
    readonly accountLostBeforeFirstPayoutStandardError: null | number;
    readonly expectedCalendarDaysToFirstPayout: UncertainValue;
    readonly expectedResetFeeBeforeFirstPayout: UncertainValue;
    readonly expectedSessionDaysToFirstPayout: UncertainValue;
    readonly firstPayoutCausedBreachProbability: null | number;
    readonly firstPayoutCausedBreachStandardError: null | number;
    readonly payingTrials: number;
    readonly trials: number;
}

export interface NextPayoutProjectionRequest {
    readonly base: Omit<SimInputs, 'plan'>;
    readonly policy: EnginePolicy;
    readonly source: AdviceSource.NextPayoutProjection;
    readonly start: FundedSimStart;
}

export function runNextPayoutProjection(
    plan: Plan,
    request: NextPayoutProjectionRequest,
): NextPayoutProjection {
    const applied = applyEnginePolicy(plan, request.policy, {
        ...request.base,
        plan,
    });
    const startIssue = simStartIssue(plan, request.start, applied.maxEvalDays);
    if (startIssue !== null) {
        throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${startIssue}`);
    }

    if (isAlreadyEligible(plan, applied, request.start)) {
        return {
            accountLostBeforeFirstPayoutProbability: 0,
            accountLostBeforeFirstPayoutStandardError: 0,
            expectedCalendarDaysToFirstPayout: { standardError: 0, value: 0 },
            expectedResetFeeBeforeFirstPayout: { standardError: 0, value: 0 },
            expectedSessionDaysToFirstPayout: { standardError: 0, value: 0 },
            firstPayoutCausedBreachProbability: 0,
            firstPayoutCausedBreachStandardError: 0,
            payingTrials: applied.trials,
            trials: applied.trials,
        };
    }

    const commission = dollars(
        applied.commissionPerRoundTrip ?? SIM_DEFAULTS.commissionPerRoundTrip,
    );
    const cushion = plan.resolveRetainedCushion(applied.minRetainedCushion);
    const winrate = fraction(applied.winrate);
    const fundedDayPolicy = resolveDayPolicy(applied, TradingPhase.Funded);
    const positionSizing = resolvePositionSizing(
        applied.instrument,
        applied.stopPoints,
    );
    const rng = mulberry32(applied.seed);
    const { trials } = applied;

    let sessionDaysSum = 0;
    let sessionDaysSquaredSum = 0;
    let calendarDaysSum = 0;
    let calendarDaysSquaredSum = 0;
    let payingTrials = 0;
    let lostTrials = 0;
    let breachedAtFirstPayoutTrials = 0;
    let resetFeeSum = 0;
    let resetFeeSquaredSum = 0;

    for (let index = 0; index < trials; index++) {
        const state = { ...request.start.state };
        const totals = new TradeTotals();
        const streak = new LossStreak(totals);
        const stats = newPhaseStats(state.balance, totals, streak);
        const tracker = restoreFundedCycleTracker(state, request.start.seed);
        const sink = new PayoutTotals();
        const result = runFundedDays({
            commission,
            dayOffsetBase: 0,
            dayPolicy: fundedDayPolicy,
            discounts: applied.discounts,
            equityCurve: null,
            idleDayProbability: applied.idleDayProbability,
            initialTracker: tracker,
            intradayPathStepsPerR: applied.intradayPathStepsPerR,
            maxDays: applied.fundedHorizonDays,
            minRetainedCushion: cushion,
            payoutRequestPolicy: applied.payoutRequestPolicy,
            payoutRequestSize: applied.payoutRequestSize,
            plan,
            positionSizing,
            priorFundedResetsUsed: request.start.seed.fundedResetsUsed,
            rng,
            rrRatio: applied.fundedRrRatio ?? applied.rrRatio,
            rungSizing: applied.rungSizing ?? DEFAULT_RUNG_SIZING,
            sink,
            state,
            stats,
            winrate,
        });

        const firstPayoutDay = sink.firstPayoutDay;
        const payoutCount = sink.count;
        if (firstPayoutDay !== null) {
            payingTrials += 1;
            sessionDaysSum += firstPayoutDay;
            sessionDaysSquaredSum += firstPayoutDay * firstPayoutDay;
            const calendarDays = calendarDaysForSessionDays(firstPayoutDay);
            calendarDaysSum += calendarDays;
            calendarDaysSquaredSum += calendarDays * calendarDays;
            const feeBeforeFirstPayout = result.fundedResets
                .filter((reset) => reset.dayOffset <= firstPayoutDay)
                .reduce((sum, reset) => sum + reset.fee, 0);
            resetFeeSum += feeBeforeFirstPayout;
            resetFeeSquaredSum += feeBeforeFirstPayout * feeBeforeFirstPayout;
            if (payoutCount === 1 && result.stage === FundedStage.Busted) {
                breachedAtFirstPayoutTrials += 1;
            }
        } else if (result.stage === FundedStage.Busted) {
            lostTrials += 1;
        }
    }

    return {
        accountLostBeforeFirstPayoutProbability: lostTrials / trials,
        accountLostBeforeFirstPayoutStandardError: binomialStandardError(
            lostTrials / trials,
            trials,
        ),
        expectedCalendarDaysToFirstPayout: uncertainMeanOf(
            calendarDaysSum,
            calendarDaysSquaredSum,
            payingTrials,
        ),
        expectedResetFeeBeforeFirstPayout: uncertainMeanOf(
            resetFeeSum,
            resetFeeSquaredSum,
            payingTrials,
        ),
        expectedSessionDaysToFirstPayout: uncertainMeanOf(
            sessionDaysSum,
            sessionDaysSquaredSum,
            payingTrials,
        ),
        firstPayoutCausedBreachProbability:
            payingTrials === 0 ? null : breachedAtFirstPayoutTrials / trials,
        firstPayoutCausedBreachStandardError:
            payingTrials === 0
                ? null
                : binomialStandardError(
                      breachedAtFirstPayoutTrials / trials,
                      trials,
                  ),
        payingTrials,
        trials,
    };
}

function calendarDaysForSessionDays(sessionDays: number): number {
    return Math.round(
        (sessionDays * CALENDAR_DAYS_PER_WEEK) / SESSION_DAYS_PER_CALENDAR_WEEK,
    );
}

function isAlreadyEligible(
    plan: Plan,
    applied: SimInputs,
    start: FundedSimStart,
): boolean {
    const state = { ...start.state };
    const tracker = restoreFundedCycleTracker(state, start.seed);
    const evaluation = tracker.evaluatePayout({
        minRetainedCushion: plan.resolveRetainedCushion(
            applied.minRetainedCushion,
        ),
        payoutRequestPolicy: applied.payoutRequestPolicy,
        payoutRequestSize: applied.payoutRequestSize,
        plan,
        state,
    });
    return evaluation.kind === PayoutEvaluationKind.Eligible;
}

function uncertainMeanOf(
    sum: number,
    squaredSum: number,
    n: number,
): UncertainValue {
    if (n === 0) return { standardError: null, value: 0 };
    return {
        standardError: meanStandardError(sum, squaredSum, n),
        value: sum / n,
    };
}
