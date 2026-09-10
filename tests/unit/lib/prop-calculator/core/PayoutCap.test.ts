import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    fraction,
    FundedNextVariant,
} from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { QualifyingDaysMilestonePayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';

describe('QualifyingDaysMilestonePayoutCap.resolve', () => {
    const cap = new QualifyingDaysMilestonePayoutCap({
        afterMilestone: { balanceShareCap: null, requestCap: null },
        beforeMilestone: {
            balanceShareCap: fraction(0.5),
            requestCap: dollars(6000),
        },
        milestoneQualifyingDays: 30,
    });

    it('stays in the before-milestone regime at exactly the milestone count (boundary is strict >)', () => {
        expect(cap.resolve({ cumulativeQualifyingDays: 30 })).toStrictEqual({
            balanceShareCap: 0.5,
            requestCap: 6000,
        });
    });

    it('switches to the uncapped regime one day past the milestone', () => {
        expect(cap.resolve({ cumulativeQualifyingDays: 31 })).toStrictEqual({
            balanceShareCap: null,
            requestCap: null,
        });
    });

    it('stays in the before-milestone regime well under the threshold', () => {
        expect(cap.resolve({ cumulativeQualifyingDays: 0 })).toStrictEqual({
            balanceShareCap: 0.5,
            requestCap: 6000,
        });
    });
});

describe('FundedNext Legacy: two-regime payout cap (live-verified: 50% / $6,000 before 30 benchmark days, uncapped after)', () => {
    const fundedNext = new FundedNext();

    function legacyPlan() {
        const plan = fundedNext.findPlan({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Legacy,
        });
        if (!plan) throw new Error('FundedNext Legacy 50K plan not found');
        return plan;
    }

    it('caps an early large payout at $6,000, not 50% of profit', () => {
        const plan = legacyPlan();
        const state = plan.initialState();
        state.balance = state.startingBalance + 20_000;
        state.threshold = state.startingBalance - 2000;
        state.thresholdLocked = true;
        state.qualifyingDays = 10;

        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(6000);
    });

    it('removes the cap once cumulative qualifying days exceed 30', () => {
        const plan = legacyPlan();
        const state = plan.initialState();
        state.balance = state.startingBalance + 20_000;
        state.threshold = state.startingBalance - 2000;
        state.thresholdLocked = true;
        state.qualifyingDays = 31;

        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBeGreaterThan(6000);
        expect(payout?.debited).toBe(20_000);
    });
});
