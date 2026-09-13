import { describe, expect, it } from 'vitest';

import { FirmId, LucidVariant } from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const lucid = new LucidTrading();

const pro = lucid.findPlan({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Pro,
});
if (!pro) throw new Error('lucid pro missing');

const flex = lucid.findPlan({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Flex,
});
if (!flex) throw new Error('lucid flex missing');

describe('LucidPro recurring per-cycle profit goal (support.lucidtrading.com LucidPro Payouts: $500 at the 50K tier, resets after each payout)', () => {
    it('models the confirmed $500 figure instead of leaving the field unset', () => {
        expect(pro.minPayoutProfitPerCycle).toBe(500);
    });

    it('denies a payout after the first when cycle profit is below the $500 goal, even with ample cushion room and a full ladder step available', () => {
        const state = pro.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.lastPayoutBalance = state.balance - 200;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: pro,
            state,
            tracker,
        });

        expect(payout).toBeNull();
    });

    it('clears the gate once cycle profit reaches the $500 goal', () => {
        const state = pro.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.lastPayoutBalance = state.balance - 500;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: pro,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(2500);
    });
});

describe("LucidFlex net-positive profit requirement applies to every cycle, first payout included (support.lucidtrading.com LucidFlex Payouts: 'positive net profit (even $1) during each payout cycle')", () => {
    it('sets minPayoutProfit to match minPayoutProfitPerCycle ($0.01) rather than leaving the first cycle free', () => {
        expect(flex.minPayoutProfit).toBe(0.01);
        expect(flex.minPayoutProfitPerCycle).toBe(0.01);
    });

    it('denies the very first payout when the cycle broke exactly even', () => {
        const state = flex.initialState();
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        state.balance = state.startingBalance + 5000;
        const tracker = newFundedCycleTracker(state);
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.lastPayoutBalance = state.balance;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout).toBeNull();
    });

    it('allows the first payout once cycle profit is even one cent positive', () => {
        const state = flex.initialState();
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        state.balance = state.startingBalance + 6200;
        const tracker = newFundedCycleTracker(state);
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.lastPayoutBalance = state.balance - 1200;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(600);
    });
});
