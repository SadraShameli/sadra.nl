import { describe, expect, it } from 'vitest';

import { FirmId, FundedNextVariant } from '~/lib/prop-calculator/core';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';

function legacyPlan() {
    const firm = new FundedNext();
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.Legacy,
    });
    if (!plan) throw new Error('FundedNext Legacy 50K plan not found');
    return plan;
}

describe('FundedNext consistency: isPassed already implements live "target inflation" (research confirmed no code change needed)', () => {
    it('requires only the flat profit target when no single day dominates', () => {
        const plan = legacyPlan();
        const state = plan.initialState();
        state.tradingDays = plan.minTradingDays;
        state.balance = state.startingBalance + 3000;
        state.bestDayProfit = 1000;
        expect(plan.isPassed(state)).toBe(true);
    });

    it("inflates the effective target to bestDayProfit / 40% once a single day exceeds the cap, matching FundedNext's live example ($1,500 day -> $3,750 required)", () => {
        const plan = legacyPlan();
        const state = plan.initialState();
        state.tradingDays = plan.minTradingDays;
        state.bestDayProfit = 1500;

        state.balance = state.startingBalance + 3000;
        expect(plan.isPassed(state)).toBe(false);

        state.balance = state.startingBalance + 3749;
        expect(plan.isPassed(state)).toBe(false);

        state.balance = state.startingBalance + 3750;
        expect(plan.isPassed(state)).toBe(true);
    });
});
