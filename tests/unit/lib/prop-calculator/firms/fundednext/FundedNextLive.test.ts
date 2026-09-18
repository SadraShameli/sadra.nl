import { describe, expect, it } from 'vitest';

import { buildFundedNextLivePlan } from '~/lib/prop-calculator/firms/fundednext/FundedNextLive';

describe('buildFundedNextLivePlan', () => {
    it('constructs without throwing', () => {
        expect(() => buildFundedNextLivePlan()).not.toThrow();
    });

    it("starts at the 50K tier's confirmed $2,000 deposit, with the drawdown floor at $0 -- not $0 balance like Apex/Tradeify/TPT", () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(2000);
        expect(state.startingBalance).toBe(2000);
        expect(state.threshold).toBe(0);
        expect(state.thresholdLocked).toBe(false);
    });

    it('does not lock yet at $1,000 profit (balance $3,000) -- the lock trigger is profit equal to the starting balance, not the $1,000 offset', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 3000;

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(false);
    });

    it('locks the threshold $1,000 BELOW the starting balance once profit reaches the starting balance itself (balance $4,000) -- the opposite lock direction from every other confirmed live firm', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 4000;

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(1000);
        expect(state.threshold).toBeLessThan(state.startingBalance);
        expect(state.threshold).toBe(state.startingBalance - 1000);
    });

    it('is busted only once balance falls to or below the $0 floor before the lock fires', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        expect(plan.isBust({ ...state, balance: 1 })).toBe(false);
        expect(plan.isBust({ ...state, balance: 0 })).toBe(true);
    });

    it('pays 100% of the first $5,000 cumulative profit, then 90% after', () => {
        const plan = buildFundedNextLivePlan();

        expect(plan.payoutFromProfit(3000)).toBeCloseTo(3000, 10);
        expect(plan.payoutFromProfit(5000)).toBeCloseTo(5000, 10);
        expect(plan.payoutFromProfit(7000)).toBeCloseTo(5000 + 2000 * 0.9, 10);
    });

    it('has no contract cap modeled -- no live-specific figure was confirmed for FundedNext Live', () => {
        const plan = buildFundedNextLivePlan();

        expect(plan.contractLimit).toBeNull();
    });
});
