import { type DatedCharge } from '~/lib/prop-calculator/core/DatedCharge';
import { type CouponDiscounts } from '~/lib/prop-calculator/core/FeeSchedule';
import {
    type FundedCycleTracker,
    type FundedPayoutResult,
    newFundedCycleTracker,
    newFundedCycleTrackerAfterReset,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import {
    canTakeFundedReset,
    fundedResetFee,
} from '~/lib/prop-calculator/core/FundedReset';
import { type PayoutRequestPolicy } from '~/lib/prop-calculator/core/PayoutRequestPolicy';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';

import { runDay } from './day';
import {
    NO_LIVE_TRANSFER_CASH,
    runLiveTransferContinuation,
} from './livePhase';
import { newPhaseStats } from './PhaseStats';
import {
    type FundedDayStepOptions,
    type FundedFromStateOptions,
    type FundedHorizonOptions,
    type FundedHorizonResult,
    type LiveTransferOptions,
} from './types';

export enum FundedDayOutcomeKind {
    Busted = 'busted',
    Concluded = 'concluded',
    Continued = 'continued',
    Reset = 'reset',
}

export enum FundedStage {
    Busted = 'busted',
    Concluded = 'concluded',
    HorizonReached = 'horizon-reached',
    TransferredLive = 'transferred-live',
}

export interface FundedDayAdvanceOptions extends FundedDayStepOptions {
    discounts: CouponDiscounts | undefined;
    equityCurve: null | number[];
    minRetainedCushion: number;
    payoutRequestPolicy?: PayoutRequestPolicy;
    payoutRequestSize: number | undefined;
    resetsUsed: number;
}

export type FundedDayOutcome =
    | {
          readonly closedForInactivity: boolean;
          readonly kind: FundedDayOutcomeKind.Busted;
          readonly payout: FundedPayoutResult | null;
      }
    | {
          readonly fee: number;
          readonly kind: FundedDayOutcomeKind.Reset;
          readonly tracker: FundedCycleTracker;
      }
    | {
          readonly kind: FundedDayOutcomeKind.Concluded;
          readonly payout: FundedPayoutResult;
      }
    | {
          readonly kind: FundedDayOutcomeKind.Continued;
          readonly payout: FundedPayoutResult | null;
      };

export interface FundedDaysOptions extends Omit<
    FundedDayStepOptions,
    'tracker'
> {
    dayOffsetBase: number;
    discounts: CouponDiscounts | undefined;
    equityCurve: null | number[];
    initialTracker?: FundedCycleTracker;
    liveTransfer?: LiveTransferOptions;
    maxDays: number;
    minRetainedCushion: number;
    payoutRequestPolicy?: PayoutRequestPolicy;
    payoutRequestSize: number | undefined;
    priorFundedResetsUsed?: number;
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

export function advanceFundedDay(
    options: FundedDayAdvanceOptions,
): FundedDayOutcome {
    const {
        discounts,
        equityCurve,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        resetsUsed,
        ...stepOptions
    } = options;
    const { plan, state, tracker } = stepOptions;
    const { busted, closedForInactivity } = stepFundedDay(stepOptions);
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
                resetsUsed,
            })
        ) {
            plan.beginFundedPhase(state);
            return {
                fee: fundedResetFee(policy, discounts),
                kind: FundedDayOutcomeKind.Reset,
                tracker: newFundedCycleTrackerAfterReset(state, resetsUsed + 1),
            };
        }
        return {
            closedForInactivity,
            kind: FundedDayOutcomeKind.Busted,
            payout: null,
        };
    }

    const payout = tracker.tryPayout({
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        state,
    });
    if (payout === null) {
        return { kind: FundedDayOutcomeKind.Continued, payout };
    }
    if (payout.causesHardBreach) {
        return {
            closedForInactivity: false,
            kind: FundedDayOutcomeKind.Busted,
            payout,
        };
    }
    const isConcluded = plan.isAccountConcluded(
        tracker.payoutsIssued,
        tracker.cumulativePayout,
    );
    return {
        kind: isConcluded
            ? FundedDayOutcomeKind.Concluded
            : FundedDayOutcomeKind.Continued,
        payout,
    };
}

export function runFundedDays(options: FundedDaysOptions): FundedDaysResult {
    const {
        commission,
        dayOffsetBase,
        dayPolicy,
        discounts,
        equityCurve,
        idleDayProbability,
        initialTracker,
        intradayPathStepsPerR,
        liveTransfer,
        maxDays,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        positionSizing,
        priorFundedResetsUsed = 0,
        rng,
        rrRatio,
        rungSizing,
        sink,
        state,
        stats,
        tradeRng,
        winrate,
    } = options;
    let tracker = initialTracker ?? newFundedCycleTracker(state);
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
        tradeRng,
        winrate,
    };

    for (let day = 0; day < maxDays; day++) {
        const outcome = advanceFundedDay({
            ...dayOptions,
            discounts,
            equityCurve,
            minRetainedCushion,
            payoutRequestPolicy,
            payoutRequestSize,
            resetsUsed: priorFundedResetsUsed + fundedResets.length,
        });
        daysElapsed += 1;

        switch (outcome.kind) {
            case FundedDayOutcomeKind.Busted: {
                if (outcome.payout !== null) {
                    sink.record(
                        dayOffsetBase + daysElapsed,
                        outcome.payout.traderReceives,
                    );
                }
                return {
                    closedForInactivity: outcome.closedForInactivity,
                    daysElapsed,
                    fundedResets,
                    stage: FundedStage.Busted,
                    tracker,
                };
            }
            case FundedDayOutcomeKind.Concluded: {
                sink.record(
                    dayOffsetBase + daysElapsed,
                    outcome.payout.traderReceives,
                );
                return {
                    closedForInactivity: false,
                    daysElapsed,
                    fundedResets,
                    stage: hasDrawnLiveTransfer(liveTransfer, tracker)
                        ? FundedStage.TransferredLive
                        : FundedStage.Concluded,
                    tracker,
                };
            }
            case FundedDayOutcomeKind.Continued: {
                if (outcome.payout !== null) {
                    sink.record(
                        dayOffsetBase + daysElapsed,
                        outcome.payout.traderReceives,
                    );
                    if (hasDrawnLiveTransfer(liveTransfer, tracker)) {
                        return {
                            closedForInactivity: false,
                            daysElapsed,
                            fundedResets,
                            stage: FundedStage.TransferredLive,
                            tracker,
                        };
                    }
                }
                continue;
            }
            case FundedDayOutcomeKind.Reset: {
                fundedResets.push({
                    dayOffset: dayOffsetBase + daysElapsed,
                    fee: outcome.fee,
                });
                tracker = outcome.tracker;
                dayOptions = { ...dayOptions, tracker };
                continue;
            }
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

export function runFundedFromState(
    options: FundedFromStateOptions,
): FundedHorizonResult {
    const {
        commission,
        dayPolicy,
        discounts,
        equityCurve,
        fundedHorizonDays,
        idleDayProbability,
        initialTracker,
        intradayPathStepsPerR,
        liveTransfer,
        minRetainedCushion,
        payoutRequestPolicy,
        payoutRequestSize,
        plan,
        positionSizing,
        priorFundedResetsUsed,
        rng,
        rrRatio,
        rungSizing,
        state,
        stats,
        winrate,
    } = options;
    const sink = new PayoutTotals();

    const { closedForInactivity, daysElapsed, fundedResets, stage, tracker } =
        runFundedDays({
            commission,
            dayOffsetBase: 0,
            dayPolicy,
            discounts,
            equityCurve,
            idleDayProbability,
            initialTracker,
            intradayPathStepsPerR,
            liveTransfer,
            maxDays: fundedHorizonDays,
            minRetainedCushion,
            payoutRequestPolicy,
            payoutRequestSize,
            plan,
            positionSizing,
            priorFundedResetsUsed,
            rng,
            rrRatio,
            rungSizing,
            sink,
            state,
            stats,
            winrate,
        });

    const isTransferredLive = stage === FundedStage.TransferredLive;
    const liveSlotDays = isTransferredLive
        ? fundedHorizonDays - daysElapsed
        : 0;
    const liveCash =
        isTransferredLive && liveTransfer?.continuation
            ? runLiveTransferContinuation(
                  liveTransfer.continuation,
                  state,
                  liveSlotDays,
                  liveTransfer.rng,
              )
            : NO_LIVE_TRANSFER_CASH;

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
        isAliveAtHorizon: stage === FundedStage.HorizonReached,
        isBustedFunded: stage === FundedStage.Busted,
        isTransferredLive,
        liveSlotDays,
        liveTransferCash: liveCash.recurring,
        liveTransferOneOff: liveCash.oneOff,
        payoutCount: sink.count,
        totalPayout: sink.total,
    };
}

export function runFundedHorizon(
    options: FundedHorizonOptions,
): FundedHorizonResult {
    const { attempt, ...rest } = options;
    const { state } = attempt;
    rest.plan.beginFundedPhase(state);
    const stats = newPhaseStats(
        state.balance,
        attempt.stats.totals,
        attempt.streak,
    );
    return runFundedFromState({
        ...rest,
        equityCurve: attempt.equityCurve,
        state,
        stats,
    });
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
        tradeRng,
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
        tradeRng,
        winrate,
    });
    if (state.todayPnL > tracker.cycleBestDayProfit) {
        tracker.cycleBestDayProfit = state.todayPnL;
    }
    if (!busted) tracker.recordSessionClose(state);
    return { busted, closedForInactivity };
}

function hasDrawnLiveTransfer(
    liveTransfer: LiveTransferOptions | undefined,
    tracker: FundedCycleTracker,
): boolean {
    if (liveTransfer === undefined) return false;
    const { cumulativePayoutLimit, hazard, rng } = liveTransfer;
    const isTriggerReached =
        cumulativePayoutLimit !== null &&
        tracker.cumulativePayout >= cumulativePayoutLimit;
    return isTriggerReached || (hazard > 0 && rng() < hazard);
}
