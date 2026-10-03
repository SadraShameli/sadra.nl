import { describe, expect, it } from 'vitest';

import {
    FirmId,
    FundedNextVariant,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { newFundedCycleTracker } from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const fundedNext = new FundedNext();
const mffu = new MyFundedFutures();

const BUFFER_LEVEL = 52_100;

function atBalance(balance: number) {
    const plan = rapidDailyPlan();
    const state = plan.initialState();
    state.balance = balance;
    state.threshold = 50_100;
    state.thresholdLocked = true;
    state.qualifyingDays = 99;
    return state;
}

function laterCyclePayout(balance: number) {
    const plan = rapidDailyPlan();
    const state = atBalance(balance);
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = state.startingBalance;
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.payoutsIssued = 1;
    tracker.recordSessionClose(state);
    return tracker.tryPayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
    });
}

function rapidDailyPlan() {
    const plan = fundedNext.findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.RapidDaily,
    });
    if (!plan) throw new Error('FundedNext Rapid Daily 50K plan not found');
    return plan;
}

function rapidProPlan() {
    const plan = fundedNext.findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.RapidPro,
    });
    if (!plan) throw new Error('FundedNext Rapid Pro 50K plan not found');
    return plan;
}

function requestPayout(balance: number) {
    const plan = rapidDailyPlan();
    const state = atBalance(balance);
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = state.startingBalance;
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.recordSessionClose(state);
    return tracker.tryPayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
    });
}

describe('FundedNext Rapid Daily buffer', () => {
    it('derives the documented $52,100 buffer level at 50K', () => {
        const plan = rapidDailyPlan();
        expect(plan.payoutBuffer).not.toBeNull();
        expect(
            plan.payoutBuffer?.requiredBalance(
                plan.accountSize,
                plan.fundedDrawdown.amount,
            ),
        ).toBe(BUFFER_LEVEL);
    });

    it("reproduces the firm's worked example: $53,000 balance pays $900 gross, $810 net", () => {
        const payout = requestPayout(53_000);
        expect(payout?.debited).toBe(900);
        expect(payout?.traderReceives).toBe(810);
    });

    it('leaves the balance resting exactly on the buffer after that payout', () => {
        const plan = rapidDailyPlan();
        const state = atBalance(53_000);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });

        expect(state.balance).toBe(BUFFER_LEVEL);
    });

    it('denies a payout while the balance sits below the buffer', () => {
        expect(requestPayout(52_050)).toBeNull();
        expect(requestPayout(BUFFER_LEVEL)).toBeNull();
    });

    it('requires the balance to sit $250 above the buffer before the FIRST payout (current article 17229779: EOD balance at or above the buffer, $500 of cycle profit, $250 minimum), not the superseded $2,600 reading of 15878210', () => {
        expect(requestPayout(BUFFER_LEVEL + 249)).toBeNull();
        const payout = requestPayout(BUFFER_LEVEL + 250);
        expect(payout?.debited).toBe(250);
        expect(payout?.traderReceives).toBe(225);
    });

    it('denies a payout on a later cycle (gated by minPayoutProfitPerCycle) when the room above the buffer is under the $250 minimum', () => {
        expect(laterCyclePayout(52_300)).toBeNull();
        expect(laterCyclePayout(52_350)?.debited).toBe(250);
    });

    it('caps a large withdrawal at the documented $1,200 per cycle', () => {
        const payout = requestPayout(56_000);
        expect(payout?.debited).toBe(1200);
        expect(payout?.traderReceives).toBe(1080);
    });

    it('binds on the buffer rather than the drawdown threshold, on a later cycle', () => {
        const plan = rapidDailyPlan();
        const state = atBalance(52_500);
        expect(state.balance - state.threshold).toBe(2400);
        expect(plan.payoutBalanceFloor(state, 0)).toBe(BUFFER_LEVEL);
        expect(laterCyclePayout(52_500)?.debited).toBe(400);
    });

    it('yields to minRetainedCushion when that floor is the higher one', () => {
        const plan = rapidDailyPlan();
        const state = atBalance(53_000);
        expect(plan.payoutBalanceFloor(state, 3000)).toBe(53_100);
        expect(plan.payoutBalanceFloor(state, 1000)).toBe(BUFFER_LEVEL);
    });
});

describe('plans without a payout buffer', () => {
    it('leaves Rapid Pro ungated by any buffer', () => {
        expect(rapidProPlan().payoutBuffer).toBeNull();
    });

    it('keeps the floor at threshold plus cushion when no buffer is configured', () => {
        const plan = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        });
        if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');

        const state = plan.initialState();
        state.balance = 53_000;
        state.threshold = 50_100;

        expect(plan.payoutBuffer).toBeNull();
        expect(plan.payoutBalanceFloor(state, 0)).toBe(50_100);
        expect(plan.payoutBalanceFloor(state, 500)).toBe(50_600);
    });
});

function payoutAfterQualifyingDays(qualifyingDaysSincePayout: number) {
    const plan = rapidProPlan();
    const state = plan.initialState();
    state.balance = state.startingBalance + 1000;
    state.qualifyingDays = qualifyingDaysSincePayout;
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = state.startingBalance;
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.recordSessionClose(state);
    return tracker.tryPayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
    });
}

describe("FundedNext Rapid Pro payout cadence (live-verified: 'every 3 days', distinct from Rapid Daily's 0)", () => {
    it('sets minDaysAfterPassForPayout to 3, not 0', () => {
        expect(rapidProPlan().minDaysAfterPassForPayout).toBe(3);
    });

    it('denies a payout with only 2 qualifying days since the last one despite ample cycle profit', () => {
        expect(payoutAfterQualifyingDays(2)).toBeNull();
    });

    it(
        'allows the payout once 3 qualifying days have passed, capped to $900 ' +
            'rather than the full $1000 profit -- LockAtPlanFloor force-locks the ' +
            'threshold to $50,100 (startingBalance + RAPID_LOCK_OFFSET) as a ' +
            'result of this very payout, and the withdrawal must be sized ' +
            'against that post-lock floor, not the pre-lock $48,000 threshold, ' +
            'or the payout would land the account exactly on/below its own new ' +
            'floor',
        () => {
            expect(payoutAfterQualifyingDays(3)?.debited).toBe(900);
        },
    );
});
