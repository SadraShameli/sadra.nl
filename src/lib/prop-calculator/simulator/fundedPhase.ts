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
    closedForInactivity: boolean;
    daysElapsed: number;
    stage: FundedStage;
}

export interface PayoutSink {
    record(dayOffset: number, traderReceives: number): void;
}

export class PayoutTotals implements PayoutSink {
    count = 0;

    firstPayoutDay: null | number = null;

    total = 0;

    record(dayOffset: number, traderReceives: number): void {
        this.count += 1;
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
        idleDayProbability,
        intradayPathStepsPerR,
        maxDays,
        maxPayouts,
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
    } = options;
    const tracker = newFundedCycleTracker(state);
    let daysElapsed = 0;
    const dayOptions = {
        commission,
        dayPolicy,
        idleDayProbability,
        intradayPathStepsPerR,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        tracker,
        winrate,
    };

    for (let day = 0; day < maxDays; day++) {
        const { busted, closedForInactivity } = stepFundedDay(dayOptions);
        daysElapsed += 1;
        if (equityCurve) {
            equityCurve.push(state.balance);
        }

        if (busted) {
            return {
                closedForInactivity,
                daysElapsed,
                stage: FundedStage.Busted,
            };
        }

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

        if (payout.causesHardBreach) {
            return {
                closedForInactivity: false,
                daysElapsed,
                stage: FundedStage.Busted,
            };
        }

        if (tracker.payoutsIssued >= maxPayouts) {
            return {
                closedForInactivity: false,
                daysElapsed,
                stage: FundedStage.PayoutBudgetSpent,
            };
        }
        if (
            plan.isAccountConcluded(
                tracker.payoutsIssued,
                tracker.cumulativePayout,
            )
        ) {
            return {
                closedForInactivity: false,
                daysElapsed,
                stage: FundedStage.Concluded,
            };
        }
    }

    return {
        closedForInactivity: false,
        daysElapsed,
        stage: FundedStage.HorizonReached,
    };
}

export function runFundedHorizon(
    options: FundedHorizonOptions,
): FundedHorizonResult {
    const {
        attempt,
        commission,
        dayPolicy,
        fundedHorizonDays,
        idleDayProbability,
        intradayPathStepsPerR,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        positionSizing,
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

    const { closedForInactivity, daysElapsed, stage } = runFundedDays({
        commission,
        dayOffsetBase: 0,
        dayPolicy,
        equityCurve: attempt.equityCurve,
        idleDayProbability,
        intradayPathStepsPerR,
        maxDays: fundedHorizonDays,
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

    return {
        closedForInactivity,
        daysElapsed,
        firstPayoutDay: sink.firstPayoutDay,
        isBustedFunded: stage === FundedStage.Busted,
        payoutCount: sink.count,
        totalPayout: sink.total,
    };
}

export function stepFundedDay(options: FundedDayStepOptions): {
    busted: boolean;
    closedForInactivity: boolean;
} {
    const {
        commission,
        dayPolicy,
        idleDayProbability,
        intradayPathStepsPerR,
        plan,
        positionSizing,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        tracker,
        winrate,
    } = options;
    const { busted, closedForInactivity } = runDay({
        commission,
        cycleBestDayProfit: tracker.cycleBestDayProfit,
        dayPolicy,
        idleDayProbability,
        intradayPathStepsPerR,
        payoutsIssued: tracker.payoutsIssued,
        phase: TradingPhase.Funded,
        plan,
        positionSizing,
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
    return { busted, closedForInactivity };
}
