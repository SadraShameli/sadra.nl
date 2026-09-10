import { describe, expect, it } from 'vitest';

import { FirmId, MffuVariant } from '~/lib/prop-calculator/core';
import {
    FundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const mffu = new MyFundedFutures();

function rapidEod() {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('tracker.tryPayout enforces maxPayouts by count', () => {
    it('refuses a payout once payoutsIssued has reached the cap', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;

        const tracker = new FundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.payoutsIssued = 3;

        const payout = tryFundedPayout({
            maxPayouts: 3,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout).toBeNull();
    });

    it('still pays out one below the cap', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;

        const tracker = new FundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.payoutsIssued = 2;

        const payout = tryFundedPayout({
            maxPayouts: 3,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(tracker.payoutsIssued).toBe(3);
    });

    it('is equivalent to the old <= 0 guard at the origin', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;

        const tracker = new FundedCycleTracker(state);
        expect(
            tryFundedPayout({
                maxPayouts: 0,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
                tracker,
            }),
        ).toBeNull();
    });
});
