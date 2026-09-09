import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '../core/FundedPayoutCycle';
import { runEvalWithRetries, stepFundedDay } from '../simulator';
import {
    type CardOutcome,
    type CardResult,
    DEFAULT_MAX_PAYOUTS_PER_CARD,
    type EvalToFundedCycleOptions,
    type PayoutEvent,
} from './types';

const MAX_EVAL_ATTEMPTS_PER_CARD = 25;

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
        winrate,
    });
    const { attemptsUsed, resetFeesPaid } = retryResult;
    let totalDays = retryResult.daysElapsed;

    if (retryResult.terminalOutcome !== null) {
        const outcome: CardOutcome =
            retryResult.terminalOutcome === 'busted'
                ? 'bust-eval'
                : 'timeout-eval';
        return {
            attemptsUsed,
            outcome,
            payouts: [],
            totalCost:
                plan.totalCostThroughDay(totalDays, discounts) + resetFeesPaid,
            totalDays,
        };
    }

    const { state } = retryResult.attempt;
    state.fundingBaseline = state.balance;

    const ladder = plan.payoutLadder;
    const payouts: PayoutEvent[] = [];
    const tracker = newFundedCycleTracker(state);
    let fundedDays = 0;
    let isBustedFunded = false;
    let isLadderExhausted = false;

    for (let day = 0; day < safeMaxFundedDays; day++) {
        const { busted } = stepFundedDay({
            commission,
            dayPolicy: fundedDayPolicy,
            plan,
            rng,
            rrRatio,
            rungSizing,
            state,
            stats: retryResult.attempt.stats,
            tracker,
            winrate,
        });
        fundedDays += 1;

        if (busted) {
            isBustedFunded = true;
            break;
        }

        const payout = tryFundedPayout({
            maxPayouts: payoutCap,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            state,
            tracker,
        });
        if (payout === null) continue;

        payouts.push({
            amount: payout.traderReceives,
            dayOffset: totalDays + fundedDays,
        });

        if (
            tracker.payoutsIssued >= payoutCap ||
            (ladder && tracker.payoutsIssued >= ladder.steps.length)
        ) {
            isLadderExhausted = true;
            break;
        }
    }

    totalDays += fundedDays;
    const outcome: CardOutcome = isBustedFunded
        ? 'bust-funded'
        : isLadderExhausted
          ? 'ladder-exhausted'
          : 'card-closed';

    return {
        attemptsUsed,
        outcome,
        payouts,
        totalCost:
            plan.totalCostThroughDay(totalDays, discounts) + resetFeesPaid,
        totalDays,
    };
}
