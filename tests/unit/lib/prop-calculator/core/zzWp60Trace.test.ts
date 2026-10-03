import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    applyTrade,
    closeTradingDay,
    ConsistencyRule,
    ConsistencyScope,
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
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

function consistencyToyPlan(): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('x');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4)),
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 2,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('trace', () => {
    it('bucket one payout paths', () => {
        const plan = consistencyToyPlan();
        const cfg = {
            actionStepMultiple: 1,
            convergenceTolerance: 0.01,
            cushionStepMultiple: 0.5,
            cycleBestDayBucketCount: 1,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            maxCushionMultiple: 6,
            maxTailCushionMultiple: 12,
            plan,
            rrRatio: 2,
            tradesPerDay: 2,
            winrate: 0.5,
        };
        const r = computeFundedStateValue(cfg);
        const { computeRisk } = r.dayPolicy;
        if (!computeRisk) throw new Error('no risk');
        const slots = r.dayPolicy.ladder.length;
        const minRetainedCushion = plan.resolveRetainedCushion(undefined);
        const found: string[] = [];
        let payoutMass = 0;
        let paths = 0;
        function branch(from: {
            state: AccountState;
            tracker: FundedCycleTracker;
        }) {
            const state = { ...from.state };
            const tracker = newFundedCycleTracker(state);
            Object.assign(tracker, from.tracker);
            return { state, tracker };
        }
        function day(
            from: { state: AccountState; tracker: FundedCycleTracker },
            depth: number,
            prob: number,
            history: string,
        ): void {
            if (depth <= 0) return;
            const b = branch(from);
            resetForNewDay(b.state);
            trades(b, 0, depth, prob, history);
        }
        function close(
            from: { state: AccountState; tracker: FundedCycleTracker },
            depth: number,
            prob: number,
            history: string,
            isTraded: boolean,
        ): void {
            const { state, tracker } = branch(from);
            closeTradingDay(plan, TradingPhase.Funded, state, isTraded);
            if (plan.isBust(state, TradingPhase.Funded)) return;
            if (state.todayPnL > tracker.cycleBestDayProfit) {
                tracker.cycleBestDayProfit = state.todayPnL;
            }
            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion,
                plan,
                state,
            });
            if (payout && payout.traderReceives > 0) {
                payoutMass += prob * payout.traderReceives;
                paths++;
                if (found.length < 6) {
                    found.push(
                        `${history} day(pnl=${state.todayPnL}, bal=${state.balance}, best=${tracker.cycleBestDayProfit}) payout=${payout.traderReceives} p=${prob}`,
                    );
                }
                return;
            }
            day(
                { state, tracker },
                depth - 1,
                prob,
                `${history}|d(${state.todayPnL})`,
            );
        }
        function trades(
            from: { state: AccountState; tracker: FundedCycleTracker },
            tradeIndex: number,
            depth: number,
            prob: number,
            history: string,
        ): void {
            if (tradeIndex >= slots) {
                close(from, depth, prob, history, true);
                return;
            }
            const { state, tracker } = from;
            const intended = computeRisk(
                state,
                tradeIndex,
                tracker.cycleSnapshot(plan, state),
            );
            const room = plan.affordableRoom(
                state,
                TradingPhase.Funded,
                0,
            ).room;
            const risk = Math.min(intended, room);
            if (risk <= 0) {
                close(from, depth, prob, history, tradeIndex > 0);
                return;
            }
            for (const [pnl, p] of [
                [2 * risk, 0.5],
                [-risk, 0.5],
            ] as const) {
                const b = branch(from);
                applyTrade(plan, TradingPhase.Funded, b.state, pnl);
                if (plan.isBust(b.state, TradingPhase.Funded)) continue;
                if (plan.isDayLockedOut(b.state, TradingPhase.Funded)) {
                    close(b, depth, prob * p, `${history}t(${pnl})`, true);
                } else {
                    trades(
                        b,
                        tradeIndex + 1,
                        depth,
                        prob * p,
                        `${history}t(${pnl})`,
                    );
                }
            }
        }
        const initial = plan.initialState();
        plan.beginFundedPhase(initial);
        day(
            { state: initial, tracker: newFundedCycleTracker(initial) },
            5,
            1,
            '',
        );
        console.log(
            'TRACE dp',
            r.initialValue,
            'payoutMass',
            payoutMass,
            'paths',
            paths,
            'slots',
            slots,
        );
        for (const f of found) console.log('TRACE', f);
        expect(1).toBe(1);
    }, 200_000);
});
