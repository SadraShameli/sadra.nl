import { describe, expect, it } from 'vitest';

import {
    dollars,
    INSTRUMENTS,
    InstrumentSymbol,
} from '~/lib/prop-calculator/core';
import {
    buildTptLiveDevelopmentPlan,
    buildTptLivePlan,
} from '~/lib/prop-calculator/firms/tpt/TptLive';

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

    it('has no contract cap modeled, since no live-specific figure was confirmed for standard PRO+', () => {
        const plan = buildTptLivePlan();

        expect(plan.contractLimits).toBeNull();
    });
});

describe.each([
    { build: buildTptLivePlan, drawdown: 2000, name: 'PRO+' },
    {
        build: buildTptLiveDevelopmentPlan,
        drawdown: 1250,
        name: 'PRO+ Development',
    },
])('TPT $name withdrawal floor', ({ build, drawdown }) => {
    it('floors withdrawals at the $0 starting balance', () => {
        expect(build().payoutFloor).toBe(0);
    });

    it('withdraws only the $500 of positive balance pre-lock, never the drawdown allowance below the $0 start', () => {
        const plan = build();
        const state = { ...plan.initialState(), balance: 500 };

        expect(state.threshold).toBe(-drawdown);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(500);
    });

    it('withdraws nothing from a negative balance', () => {
        const plan = build();
        const state = { ...plan.initialState(), balance: -200 };

        expect(plan.withdrawableAmount(state, dollars(0))).toBe(0);
    });
});

describe('buildTptLiveDevelopmentPlan contract limits', () => {
    it('caps the 50K tier at the confirmed 2 minis / 20 micros', () => {
        const plan = buildTptLiveDevelopmentPlan();
        const state = plan.initialState();

        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(2);
        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
        ).toBe(20);
    });
});
