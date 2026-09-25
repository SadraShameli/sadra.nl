import { evalPhaseCost } from '../core/FeeSchedule';
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
    if (!Number.isSafeInteger(maxFundedDays) || maxFundedDays < 0) {
        throw new Error(
            `maxFundedDays must be a non-negative safe integer, got ${maxFundedDays}`,
        );
    }

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
            evalCost: evalPhaseCost(
                plan.fees,
                { daysToPass: null, failedAttemptDays, resetFeesPaid },
                discounts,
            ),
            evalDays: billableEvalDays,
            fundedResetCharges: [],
            payouts: [],
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

    const { daysElapsed: fundedDays, fundedResets } = runFundedDays({
        commission,
        dayOffsetBase: totalDays,
        dayPolicy: fundedDayPolicy,
        discounts,
        equityCurve: null,
        idleDayProbability,
        maxDays: maxFundedDays,
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
        evalCost: evalPhaseCost(
            plan.fees,
            {
                daysToPass: retryResult.attempt.days,
                failedAttemptDays,
                resetFeesPaid,
            },
            discounts,
        ),
        evalDays: billableEvalDays,
        fundedResetCharges: fundedResets,
        payouts: sink.events,
        totalDays,
    };
}
