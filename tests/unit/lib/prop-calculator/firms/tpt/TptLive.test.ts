import { describe, expect, it } from 'vitest';

import { buildTptLivePlan } from '~/lib/prop-calculator/firms/tpt/TptLive';

describe('buildTptLivePlan', () => {
    it('constructs without throwing', () => {
        expect(() => buildTptLivePlan()).not.toThrow();
    });

    it("starts at $0 with PRO's confirmed $2,000 EOD trailing threshold", () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(0);
        expect(state.threshold).toBe(-2000);
        expect(state.thresholdLocked).toBe(false);
    });

    it("locks the threshold flush at $0 once profit reaches $2,000, unlike Apex/Tradeify's +$100 buffer", () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();
        state.balance = 2000;

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(0);
    });

    it('pays the confirmed 90/10 split on withdrawn profit', () => {
        const plan = buildTptLivePlan();

        expect(plan.payoutFromProfit(1000)).toBeCloseTo(900, 10);
    });

    it('has no contract cap modeled -- no live-specific figure was confirmed for PRO+', () => {
        const plan = buildTptLivePlan();

        expect(plan.contractLimit).toBeNull();
    });
});
