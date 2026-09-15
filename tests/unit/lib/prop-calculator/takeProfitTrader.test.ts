import { describe, expect, it } from 'vitest';

import { DrawdownKind, FirmId, TradingPhase } from '~/lib/prop-calculator/core';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';
import { simulate } from '~/lib/prop-calculator/simulator';

const plan = (() => {
    const found = new TakeProfitTrader().findPlan({
        accountSize: 50_000,
        firm: FirmId.Tpt,
    });
    if (!found) throw new Error('TPT 50K plan not found');
    return found;
})();

describe('Take Profit Trader 50K', () => {
    it('passes on three trading days, not five', () => {
        expect(plan.minTradingDays).toBe(3);
    });

    it('trails end-of-day in the evaluation and intraday once funded', () => {
        expect(plan.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.fundedDrawdown.kind).toBe(DrawdownKind.IntradayTrailing);
    });

    it('runs no daily loss limit in either phase', () => {
        const state = plan.initialState();
        state.todayPnL = -49_000;
        expect(plan.isDayLockedOut(state, TradingPhase.Eval)).toBe(false);
        expect(plan.isDayLockedOut(state, TradingPhase.Funded)).toBe(false);
    });

    it('applies the 50% consistency bar to the evaluation only', () => {
        expect(plan.evalConsistencyRule()?.maxBestDayShare).toBe(0.5);
        expect(plan.fundedConsistencyRule()).toBeNull();
    });

    it('has no qualifying-day requirement and no payout cap', () => {
        expect(plan.minDaysAfterPassForPayout).toBe(0);
        expect(plan.minQualifyingDayProfit).toBeNull();
        expect(plan.payoutRequestCap).toBeNull();
        expect(plan.payoutBuffer).toBeNull();
    });

    it('pays 80% with no qualifying-day requirement and no payout cap', () => {
        expect(plan.payoutFromProfit(1000)).toBe(800);
    });

    it('charges the subscription only while the evaluation runs', () => {
        expect(plan.fees.monthlySubscription).toBe(170);
        expect(plan.totalCostThroughDay(42)).toBeGreaterThan(
            plan.totalCostThroughDay(21),
        );

        const base = {
            maxEvalDays: 150,
            plan,
            riskPerTrade: 400,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 2,
            trials: 100,
            winrate: 0.55,
        } as const;
        const costAt400 = simulate({
            ...base,
            fundedHorizonDays: 400,
        }).expectedTotalCost;
        const costAt40 = simulate({
            ...base,
            fundedHorizonDays: 40,
        }).expectedTotalCost;
        expect(Math.abs(costAt400 - costAt40)).toBeLessThan(10);
    });
});
