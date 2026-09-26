import { type DatedCharge } from '../core/DatedCharge';
import { type CouponDiscounts } from '../core/FeeSchedule';
import {
    type FundedCycleTracker,
    newFundedCycleTracker,
    newFundedCycleTrackerAfterReset,
} from '../core/FundedPayoutCycle';
import { canTakeFundedReset, fundedResetFee } from '../core/FundedReset';
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
}

export interface FundedDaysOptions extends Omit<
    FundedDayStepOptions,
    'tracker'
> {
    dayOffsetBase: number;
    discounts: CouponDiscounts | undefined;
    equityCurve: null | number[];
    maxDays: number;
    minRetainedCushion: number;
    payoutRequestSize: number | undefined;
    sink: PayoutSink;
}

export interface FundedDaysResult {
    closedForInactivity: boolean;
    daysElapsed: number;
    fundedResets: DatedCharge[];
    stage: FundedStage;
    tracker: FundedCycleTracker;
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
        discounts,
        equityCurve,
        idleDayProbability,
        intradayPathStepsPerR,
        maxDays,
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
    let tracker = newFundedCycleTracker(state);
    let daysElapsed = 0;
    const fundedResets: DatedCharge[] = [];
    let dayOptions = {
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
            const policy = plan.fundedReset;
            if (
                policy !== null &&
                canTakeFundedReset(plan, {
                    closedForInactivity,
                    payoutsIssued: tracker.payoutsIssued,
                    resetsUsed: fundedResets.length,
                })
            ) {
                fundedResets.push({
                    dayOffset: dayOffsetBase + daysElapsed,
                    fee: fundedResetFee(policy, discounts),
                });
                plan.beginFundedPhase(state);
                tracker = newFundedCycleTrackerAfterReset(
                    state,
                    fundedResets.length,
                );
                dayOptions = { ...dayOptions, tracker };
                continue;
            }
            return {
                closedForInactivity,
                daysElapsed,
                fundedResets,
                stage: FundedStage.Busted,
                tracker,
            };
        }

        const payout = tracker.tryPayout({
            minRetainedCushion,
            payoutRequestSize,
            plan,
            state,
        });
        if (payout === null) continue;

        sink.record(dayOffsetBase + daysElapsed, payout.traderReceives);

        if (payout.causesHardBreach) {
            return {
                closedForInactivity: false,
                daysElapsed,
                fundedResets,
                stage: FundedStage.Busted,
                tracker,
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
                fundedResets,
                stage: FundedStage.Concluded,
                tracker,
            };
        }
    }

    return {
        closedForInactivity: false,
        daysElapsed,
        fundedResets,
        stage: FundedStage.HorizonReached,
        tracker,
    };
}

export function runFundedHorizon(
    options: FundedHorizonOptions,
): FundedHorizonResult {
    const {
        attempt,
        commission,
        dayPolicy,
        discounts,
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

    const { closedForInactivity, daysElapsed, fundedResets, stage, tracker } =
        runFundedDays({
            commission,
            dayOffsetBase: 0,
            dayPolicy,
            discounts,
            equityCurve: attempt.equityCurve,
            idleDayProbability,
            intradayPathStepsPerR,
            maxDays: fundedHorizonDays,
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

    const horizonCredit =
        stage === FundedStage.HorizonReached
            ? tracker.closeoutCredit({
                  minRetainedCushion,
                  payoutRequestSize,
                  plan,
                  state,
              })
            : 0;

    return {
        closedForInactivity,
        daysElapsed,
        firstPayoutDay: sink.firstPayoutDay,
        fundedResetFeesPaid: fundedResets.reduce(
            (total, charge) => total + charge.fee,
            0,
        ),
        fundedResetsUsed: fundedResets.length,
        horizonCredit,
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
        dayPolicy,
        fundedCycle: tracker.cycleSnapshot(plan, state),
        idleDayProbability,
        intradayPathStepsPerR,
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
    if (!busted) tracker.recordSessionClose(state);
    return { busted, closedForInactivity };
}
