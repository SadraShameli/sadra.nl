import { describe, expect, it } from 'vitest';

import { FirmId, MffuVariant } from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { newPathStats } from '~/lib/prop-calculator/simulator';

function rapidEod() {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('path stats across the funded reset', () => {
    it('does not book the eval peak as a funded drawdown', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        const stats = newPathStats(state.startingBalance);

        state.balance = 53_400;
        stats.recordTrade(true, 3400, state.balance);
        expect(stats.maxDrawdown).toBe(0);

        plan.beginFundedPhase(state);
        stats.rebasePeak(state.balance);

        state.balance -= 300;
        stats.recordTrade(false, -300, state.balance);

        expect(stats.maxDrawdown).toBe(300);
    });

    it('would have booked the whole eval profit as drawdown without the rebase', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        const stats = newPathStats(state.startingBalance);

        state.balance = 53_400;
        stats.recordTrade(true, 3400, state.balance);
        plan.beginFundedPhase(state);

        state.balance -= 300;
        stats.recordTrade(false, -300, state.balance);

        expect(stats.maxDrawdown).toBe(3700);
    });

    it('keeps accumulated totals when the peak is rebased', () => {
        const stats = newPathStats(50_000);
        stats.recordTrade(true, 600, 50_600);
        stats.recordTrade(false, -300, 50_300);

        stats.rebasePeak(50_000);

        expect(stats.tradesTaken).toBe(2);
        expect(stats.grossWins).toBe(600);
        expect(stats.grossLosses).toBe(300);
        expect(stats.maxLosingStreak).toBe(1);
        expect(stats.peakBalance).toBe(50_000);
    });
});
