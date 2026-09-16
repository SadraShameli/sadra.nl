import { describe, expect, it } from 'vitest';

import { buildTradeifyLivePlan } from '~/lib/prop-calculator/firms/tradeify/TradeifyLive';

describe('buildTradeifyLivePlan', () => {
    it('constructs without throwing', () => {
        expect(() => buildTradeifyLivePlan()).not.toThrow();
    });

    it("starts at $0 with the 50K tier's confirmed $2,000 EOD trailing threshold", () => {
        const plan = buildTradeifyLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(0);
        expect(state.threshold).toBe(-2000);
        expect(state.thresholdLocked).toBe(false);
    });

    it('locks the threshold at startingBalance + $100 once profit reaches $2,100', () => {
        const plan = buildTradeifyLivePlan();
        const state = plan.initialState();
        state.balance = 2100;

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(100);
    });

    it('pays the confirmed 80/20 split on withdrawn profit', () => {
        const plan = buildTradeifyLivePlan();

        expect(plan.payoutFromProfit(1000)).toBeCloseTo(800, 10);
    });

    it("has no contract cap modeled, unlike Apex's confirmed 10-mini live cap -- Tradeify Elite Live has no confirmed number for this", () => {
        const plan = buildTradeifyLivePlan();

        expect(plan.contractLimit).toBeNull();
    });
});
