import { describe, expect, it } from 'vitest';

import { createInitialLiveAccountState } from '~/lib/prop-calculator/core';

describe('createInitialLiveAccountState', () => {
    it('starts Apex-shaped: $0 balance, $0 starting balance, threshold at -$3,000', () => {
        const state = createInitialLiveAccountState(0, -3000);

        expect(state.balance).toBe(0);
        expect(state.startingBalance).toBe(0);
        expect(state.threshold).toBe(-3000);
        expect(state.thresholdLocked).toBe(false);
    });

    it('carries whatever initial threshold the caller passes, not a hardcoded Apex number', () => {
        const state = createInitialLiveAccountState(0, 0);

        expect(state.threshold).toBe(0);
    });

    it('starts balance and startingBalance at a nonzero deposit for firms like FundedNext, not hardcoded $0', () => {
        const state = createInitialLiveAccountState(1500, 0);

        expect(state.balance).toBe(1500);
        expect(state.startingBalance).toBe(1500);
        expect(state.threshold).toBe(0);
    });

    it('zeroes every trading-progress counter so a live account never inherits eval/funded history', () => {
        const state = createInitialLiveAccountState(0, -3000);

        expect(state.bestDayProfit).toBe(0);
        expect(state.consecutiveIdleDays).toBe(0);
        expect(state.peakDayCloseProfit).toBe(0);
        expect(state.qualifyingDays).toBe(0);
        expect(state.todayPnL).toBe(0);
        expect(state.tradingDays).toBe(0);
    });
});
