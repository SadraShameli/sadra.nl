import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '../core/FundedPayoutCycle';
import { TradingPhase } from '../core/TradingPhase';
import { runDay } from './day';
import {
    type FundedDayStepOptions,
    type FundedHorizonOptions,
    type FundedHorizonResult,
} from './types';

export function runFundedHorizon(
    options: FundedHorizonOptions,
): FundedHorizonResult {
    const {
        attempt,
        commission,
        dayPolicy,
        fundedHorizonDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        rng,
        rrRatio,
        rungSizing,
        winrate,
    } = options;
    const { state } = attempt;
    plan.beginFundedPhase(state);
    attempt.stats.rebasePeak(state.balance);

    let daysElapsed = 0;
    let isBustedFunded = false;
    let isClosed = false;
    let totalPayout = 0;
    let firstPayoutDay: null | number = null;
    const tracker = newFundedCycleTracker(state);

    for (let day = 0; day < fundedHorizonDays; day++) {
        const { busted } = stepFundedDay({
            commission,
            dayPolicy,
            plan,
            rng,
            rrRatio,
            rungSizing,
            state,
            stats: attempt.stats,
            tracker,
            winrate,
        });
        daysElapsed += 1;
        state.daysElapsed += 1;
        if (attempt.equityCurve) {
            attempt.equityCurve.push(state.balance);
        }

        if (busted) {
            isBustedFunded = true;
            break;
        }

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            state,
            tracker,
        });
        if (payout === null) continue;

        totalPayout += payout.traderReceives;
        firstPayoutDay ??= daysElapsed;

        if (plan.isAccountConcluded(tracker.payoutsIssued)) {
            isClosed = true;
            break;
        }
    }

    return {
        daysElapsed,
        firstPayoutDay,
        isBustedFunded,
        isClosed,
        payoutsIssued: tracker.payoutsIssued,
        totalPayout,
    };
}

export function stepFundedDay(options: FundedDayStepOptions): {
    busted: boolean;
} {
    const {
        commission,
        dayPolicy,
        plan,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        tracker,
        winrate,
    } = options;
    const { busted } = runDay({
        commission,
        dayPolicy,
        phase: TradingPhase.Funded,
        plan,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    });
    if (state.todayPnL > tracker.cycleBestDayProfit) {
        tracker.cycleBestDayProfit = state.todayPnL;
    }
    return { busted };
}
