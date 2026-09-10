import {
    newPhaseStats,
    type PayoutSink,
    runEvalWithRetries,
    runFundedDays,
    TradeTotals,
} from '../simulator';
import {
    type CardResult,
    DEFAULT_MAX_PAYOUTS_PER_CARD,
    type EvalToFundedCycleOptions,
    type PayoutEvent,
} from './types';

const MAX_EVAL_ATTEMPTS_PER_CARD = 25;

class PayoutLog implements PayoutSink {
    readonly events: PayoutEvent[] = [];

    record(dayOffset: number, traderReceives: number): void {
        this.events.push({ amount: traderReceives, dayOffset });
    }
}

export function runEvalToFundedCycle(
    options: EvalToFundedCycleOptions,
): CardResult {
    const {
        commission,
        discounts,
        evalDayPolicy,
        fundedDayPolicy,
        maxEvalDays,
        maxFundedDays,
        maxPayoutsPerCard = DEFAULT_MAX_PAYOUTS_PER_CARD,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing,
        winrate,
    } = options;
    const safeMaxEvalDays = Math.max(1, Math.floor(maxEvalDays));
    const safeMaxFundedDays = Math.max(0, Math.floor(maxFundedDays));
    const payoutCap = Math.max(0, Math.floor(maxPayoutsPerCard));

    const totals = new TradeTotals();
    const retryResult = runEvalWithRetries({
        commission,
        dayPolicy: evalDayPolicy,
        maxAttempts: MAX_EVAL_ATTEMPTS_PER_CARD,
        maxEvalDays: safeMaxEvalDays,
        plan,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity: false,
        totals,
        winrate,
    });
    const { attemptsUsed, resetFeesPaid } = retryResult;
    let totalDays = retryResult.daysElapsed;
    const billableEvalDays = retryResult.attempt.days;

    if (retryResult.terminalOutcome !== null) {
        return {
            attemptsUsed,
            payouts: [],
            totalCost:
                plan.totalCostThroughDay(billableEvalDays, discounts) +
                resetFeesPaid,
            totalDays,
        };
    }

    const { state } = retryResult.attempt;
    plan.beginFundedPhase(state);
    const stats = newPhaseStats(
        state.balance,
        totals,
        retryResult.attempt.streak,
    );
    const sink = new PayoutLog();

    const { daysElapsed: fundedDays } = runFundedDays({
        commission,
        dayOffsetBase: totalDays,
        dayPolicy: fundedDayPolicy,
        equityCurve: null,
        maxDays: safeMaxFundedDays,
        maxPayouts: payoutCap,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing,
        sink,
        state,
        stats,
        winrate,
    });

    totalDays += fundedDays;

    return {
        attemptsUsed,
        payouts: sink.events,
        totalCost:
            plan.totalCostThroughDay(billableEvalDays, discounts) +
            resetFeesPaid,
        totalDays,
    };
}
