import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '../core/FundedPayoutCycle';
import { TradingPhase } from '../core/TradingPhase';
import { runDay } from './day';
import { newPhaseStats } from './PhaseStats';
import {
    type FundedDayStepOptions,
    type FundedHorizonOptions,
    type FundedHorizonResult,
} from './types';

export enum FundedStage {
    Busted = 'busted',
    Concluded = 'concluded',
    HorizonReached = 'horizon-reached',
    PayoutBudgetSpent = 'payout-budget-spent',
}

export interface FundedDaysOptions extends Omit<
    FundedDayStepOptions,
    'tracker'
> {
    dayOffsetBase: number;
    equityCurve: null | number[];
    maxDays: number;
    maxPayouts: number;
    minRetainedCushion: number;
    payoutRequestSize: number | undefined;
    sink: PayoutSink;
}

export interface FundedDaysResult {
    daysElapsed: number;
    stage: FundedStage;
}

export interface PayoutSink {
    record(dayOffset: number, traderReceives: number): void;
}

export class PayoutTotals implements PayoutSink {
    firstPayoutDay: null | number = null;

    total = 0;

    record(dayOffset: number, traderReceives: number): void {
        this.total += traderReceives;
        this.firstPayoutDay ??= dayOffset;
    }
}

export function runFundedDays(options: FundedDaysOptions): FundedDaysResult {
    const {
        commission,
        dayOffsetBase,
        dayPolicy,
        equityCurve,
        maxDays,
        maxPayouts,
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
    } = options;
    const tracker = newFundedCycleTracker(state);
    let daysElapsed = 0;
    const dayOptions = {
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
    };

    for (let day = 0; day < maxDays; day++) {
        const { busted } = stepFundedDay(dayOptions);
        daysElapsed += 1;
        if (equityCurve) {
            equityCurve.push(state.balance);
        }

        if (busted) return { daysElapsed, stage: FundedStage.Busted };

        const payout = tryFundedPayout({
            maxPayouts,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            state,
            tracker,
        });
        if (payout === null) continue;

        sink.record(dayOffsetBase + daysElapsed, payout.traderReceives);

        if (tracker.payoutsIssued >= maxPayouts) {
            return { daysElapsed, stage: FundedStage.PayoutBudgetSpent };
        }
        if (plan.isAccountConcluded(tracker.payoutsIssued)) {
            return { daysElapsed, stage: FundedStage.Concluded };
        }
    }

    return { daysElapsed, stage: FundedStage.HorizonReached };
}

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
    const stats = newPhaseStats(
        state.balance,
        attempt.stats.totals,
        attempt.streak,
    );
    const sink = new PayoutTotals();

    const { daysElapsed, stage } = runFundedDays({
        commission,
        dayOffsetBase: 0,
        dayPolicy,
        equityCurve: attempt.equityCurve,
        maxDays: fundedHorizonDays,
        maxPayouts: Infinity,
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

    return {
        daysElapsed,
        firstPayoutDay: sink.firstPayoutDay,
        isBustedFunded: stage === FundedStage.Busted,
        totalPayout: sink.total,
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
