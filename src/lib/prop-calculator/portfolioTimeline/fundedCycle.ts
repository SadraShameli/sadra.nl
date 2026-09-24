import {
    activationFee,
    feesUntilPassAcrossAttempts,
} from '../core/FeeSchedule';
import {
    assertPositiveSafeInteger,
    newPhaseStats,
    type PayoutSink,
    runEvalWithRetries,
    runFundedDays,
    TradeTotals,
} from '../simulator';
import {
    type CardResult,
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
        idleDayProbability,
        maxEvalDays,
        maxFundedDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        winrate,
    } = options;
    assertPositiveSafeInteger(maxEvalDays, 'maxEvalDays');
    const safeMaxFundedDays = Math.max(0, Math.floor(maxFundedDays));

    const totals = new TradeTotals();
    const retryResult = runEvalWithRetries({
        commission,
        dayPolicy: evalDayPolicy,
        discounts,
        idleDayProbability,
        maxAttempts: MAX_EVAL_ATTEMPTS_PER_CARD,
        maxEvalDays,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        shouldCaptureEquity: false,
        totals,
        winrate,
    });
    const { attemptsUsed, failedAttemptDays, resetFeesPaid } = retryResult;
    let totalDays = retryResult.daysElapsed;
    const billableEvalDays = retryResult.daysElapsed;

    if (retryResult.terminalOutcome !== null) {
        return {
            attemptsUsed,
            evalDays: billableEvalDays,
            payouts: [],
            totalCost:
                feesUntilPassAcrossAttempts(
                    plan.fees,
                    failedAttemptDays,
                    discounts,
                ) + resetFeesPaid,
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
        idleDayProbability,
        maxDays: safeMaxFundedDays,
        maxPayouts: Infinity,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        positionSizing,
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
        evalDays: billableEvalDays,
        payouts: sink.events,
        totalCost:
            feesUntilPassAcrossAttempts(
                plan.fees,
                [...failedAttemptDays, retryResult.attempt.days],
                discounts,
            ) +
            resetFeesPaid +
            activationFee(plan.fees, discounts),
        totalDays,
    };
}
