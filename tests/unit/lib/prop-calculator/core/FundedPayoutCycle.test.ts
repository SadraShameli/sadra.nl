import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const mffu = new MyFundedFutures();
const apex = new ApexTraderFunding();

function fundedState(profit: number, threshold: number) {
    const target = plan('rapid-eod');
    const state = target.initialState();
    state.balance = state.startingBalance + profit;
    state.threshold = threshold;
    state.thresholdLocked = true;
    state.fundingBaseline = state.startingBalance;
    state.qualifyingDays = 99;
    return state;
}

function plan(variant: 'builder' | 'rapid-eod') {
    const found = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!found) throw new Error(`${variant} missing`);
    return found;
}

describe('non-ladder payouts', () => {
    it('pays out for a plan with no payout ladder', () => {
        const target = plan('rapid-eod');
        expect(target.payoutLadder).toBeNull();

        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(2900);
        expect(payout?.traderReceives).toBeCloseTo(2610, 6);
        expect(state.balance).toBe(state.threshold);
    });

    it('withholds a payout until the first-cycle profit gate is cleared', () => {
        const target = plan('rapid-eod');
        expect(target.minPayoutProfit).toBe(2100);

        const state = fundedState(2099, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        expect(
            tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: target,
                state,
                tracker,
            }),
        ).toBeNull();
    });

    it('caps the debit at the requested size without re-applying the profit gate', () => {
        const target = plan('rapid-eod');
        expect(target.minPayoutRequest).toBe(500);

        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: 500,
            plan: target,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(500);
        expect(state.balance).toBe(state.startingBalance + 2500);
    });

    it('refuses a request below the plan minimum', () => {
        const target = plan('rapid-eod');
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        expect(
            tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: 499,
                plan: target,
                state,
                tracker,
            }),
        ).toBeNull();
    });
});

describe('minimum retained cushion', () => {
    it('never withdraws below the retained cushion', () => {
        const target = plan('rapid-eod');
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 2000,
            payoutRequestSize: undefined,
            plan: target,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(900);
        expect(state.balance - state.threshold).toBeGreaterThanOrEqual(2000);
    });

    it('blocks the payout entirely when the cushion is already at the retained floor', () => {
        const target = plan('rapid-eod');
        const state = fundedState(3000, 51_000);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        expect(
            tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 2000,
                payoutRequestSize: undefined,
                plan: target,
                state,
                tracker,
            }),
        ).toBeNull();
    });
});

describe('ladder payouts', () => {
    it('pays the ladder step and stops once the steps run out', () => {
        const builder = plan('builder');
        const ladder = builder.payoutLadder;
        if (!ladder) throw new Error('builder ladder missing');

        const state = builder.initialState();
        state.balance = state.startingBalance + 40_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        let issued = 0;
        for (let attempt = 0; attempt < 10; attempt++) {
            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: builder,
                state,
                tracker,
            });
            if (payout === null) break;
            expect(payout.debited).toBe(2000);
            expect(payout.traderReceives).toBeCloseTo(1600, 6);
            issued += 1;
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;
        }
        expect(issued).toBe(ladder.steps.length);
    });

    it('pays an Apex ladder step at the full amount because its split is 100%', () => {
        const apexPlan = apex.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: 'eod',
        });
        if (!apexPlan) throw new Error('apex plan missing');

        const state = apexPlan.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: apexPlan,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(1500);
        expect(payout?.traderReceives).toBe(1500);
    });
});

describe('payout profit-share cap', () => {
    it('limits a Flex payout to 50% of cycle profit when that binds', () => {
        const flex = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: 'flex',
        });
        if (!flex) throw new Error('flex missing');
        expect(flex.payoutProfitShare).toBe(0.5);

        const state = flex.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(1500);
        expect(payout?.traderReceives).toBeCloseTo(1200, 6);
    });

    it('falls back to the dollar cap once 50% of profit exceeds it', () => {
        const flex = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: 'flex',
        });
        if (!flex) throw new Error('flex missing');

        const state = flex.initialState();
        state.balance = state.startingBalance + 20_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(2000);
        expect(payout?.traderReceives).toBeCloseTo(1600, 6);
    });
});
