import {
    type AccountState,
    applyTrade,
    closeTradingDay,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type FundedCycleTracker,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    resetForNewDay,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    type FundedStateValueConfig,
    type FundedStateValueResult,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const DAY_DEPTH = 48;
export const TOY_DRAWDOWN = 100;

interface ExactState {
    state: AccountState;
    tracker: FundedCycleTracker;
}

export function exactFundedPolicyValue(
    config: FundedStateValueConfig,
    result: FundedStateValueResult,
    dayDepth: number = DAY_DEPTH,
): number {
    const { computeRisk } = result.dayPolicy;
    if (!computeRisk) {
        throw new Error('funded DP day policy has no computeRisk');
    }
    const policyRisk: NonNullable<typeof computeRisk> = computeRisk;
    const { plan, rrRatio, winrate } = config;
    const commission = config.commission ?? 0;
    const hazard =
        config.meanHorizonDays === undefined ? 0 : 1 / config.meanHorizonDays;
    const bustValue = result.bustTerminalValue;
    const slots = result.dayPolicy.ladder.length;
    const minRetainedCushion = plan.resolveRetainedCushion(
        config.minRetainedCushion,
    );
    const memo = new Map<string, number>();

    function branchOf(from: ExactState): ExactState {
        const state = { ...from.state };
        const tracker = newFundedCycleTracker(state);
        Object.assign(tracker, from.tracker);
        return { state, tracker };
    }

    function closeDay(from: ExactState, isTraded: boolean, depth: number) {
        const { state, tracker } = branchOf(from);
        closeTradingDay(plan, TradingPhase.Funded, state, isTraded);
        if (plan.isBust(state, TradingPhase.Funded)) return bustValue;
        if (
            plan.maxConsecutiveIdleDays !== null &&
            state.consecutiveIdleDays >= plan.maxConsecutiveIdleDays
        ) {
            return bustValue;
        }
        if (state.todayPnL > tracker.cycleBestDayProfit) {
            tracker.cycleBestDayProfit = state.todayPnL;
        }
        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion,
            payoutRequestPolicy: config.payoutRequestPolicy,
            payoutRequestSize: config.payoutRequestSize,
            plan,
            state,
        });
        const cash = payout?.traderReceives ?? 0;
        if (payout?.causesHardBreach) return cash;
        if (
            plan.isAccountConcluded(
                tracker.payoutsIssued,
                tracker.cumulativePayout,
            )
        ) {
            return cash;
        }
        const credit = tracker.closeoutCredit({
            minRetainedCushion,
            payoutRequestSize: config.payoutRequestSize,
            plan,
            state,
        });
        const next = hazard === 1 ? 0 : walkDay({ state, tracker }, depth - 1);
        return cash + (1 - hazard) * next + hazard * credit;
    }

    function trade(
        from: ExactState,
        tradeIndex: number,
        pnl: number,
        depth: number,
    ): number {
        const { state, tracker } = branchOf(from);
        applyTrade(plan, TradingPhase.Funded, state, pnl);
        if (plan.isBust(state, TradingPhase.Funded)) return bustValue;
        return plan.isDayLockedOut(state, TradingPhase.Funded)
            ? closeDay({ state, tracker }, true, depth)
            : walkTrades({ state, tracker }, tradeIndex + 1, depth);
    }

    function walkTrades(
        from: ExactState,
        tradeIndex: number,
        depth: number,
    ): number {
        if (tradeIndex >= slots) return closeDay(from, true, depth);
        const { state, tracker } = from;
        const intended = policyRisk(
            state,
            tradeIndex,
            tracker.cycleSnapshot(plan, state),
        );
        const room = plan.affordableRoom(
            state,
            TradingPhase.Funded,
            commission,
        ).room;
        const risk = Math.min(intended, room);
        return risk <= 0
            ? closeDay(from, tradeIndex > 0, depth)
            : winrate *
                  trade(from, tradeIndex, rrRatio * risk - commission, depth) +
                  (1 - winrate) *
                      trade(from, tradeIndex, -risk - commission, depth);
    }

    function walkDay(from: ExactState, depth: number): number {
        if (depth <= 0) return 0;
        const key = `${depth}:${JSON.stringify(from.state)}:${JSON.stringify(from.tracker)}`;
        const known = memo.get(key);
        if (known !== undefined) return known;
        const { state, tracker } = branchOf(from);
        resetForNewDay(state);
        const value = walkTrades({ state, tracker }, 0, depth);
        memo.set(key, value);
        return value;
    }

    const initial = plan.initialState();
    plan.beginFundedPhase(initial);
    return walkDay(
        { state: initial, tracker: newFundedCycleTracker(initial) },
        dayDepth,
    );
}

export function lockAtOneFiftyToyPlan(): Plan {
    return paysTheFirstWinningCloseToyPlan().withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        minRetainedCushionOverride: undefined,
    });
}

export function paysTheFirstWinningCloseToyPlan(): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('MFF Rapid EOD 50K plan not found');
    return rapidEod.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(TOY_DRAWDOWN) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: {
                atProfit: dollars(-1000),
                lockedThreshold: (startingBalance) =>
                    startingBalance - TOY_DRAWDOWN,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minRetainedCushionOverride: dollars(0),
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}
