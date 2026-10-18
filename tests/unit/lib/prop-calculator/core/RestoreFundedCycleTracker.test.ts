import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    type FundedCycleSeed,
    MffuVariant,
    PayoutDayGateBasis,
    type Plan,
    restoreFundedCycleTracker,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function fundedState(plan: Plan, balance: number, qualifyingDays: number) {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = balance;
    state.qualifyingDays = qualifyingDays;
    return state;
}

function mffPlan(variant: MffuVariant): Plan {
    const found = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!found) throw new Error(`MFF ${variant} missing`);
    return found;
}

const SEED: FundedCycleSeed = {
    calendarDayGateProgress: 6,
    cumulativePayout: 1800,
    cycleBestDayProfit: 350,
    fundedResetsUsed: 0,
    lastPayoutBalance: 51_000,
    payoutsIssued: 2,
    qualifyingDaysAtLastPayout: 4,
};

describe('restoreFundedCycleTracker seeds a tracker from plain data through the tracker factories (F-108)', () => {
    it('echoes the seed through cycleSnapshot on a qualifying-day plan', () => {
        const plan = mffPlan(MffuVariant.RapidEod);
        expect(plan.payoutDayGateBasis).toBe(
            PayoutDayGateBasis.QualifyingDaysSincePassOrPayout,
        );
        const state = fundedState(plan, 52_000, 9);

        const tracker = restoreFundedCycleTracker(state, SEED);

        expect(tracker.cycleSnapshot(plan, state)).toStrictEqual({
            cycleBestDayProfit: 350,
            dayGateProgress: 5,
            fundedResetsUsed: 0,
            lastPayoutBalance: 51_000,
            payoutsIssued: 2,
        });
        expect(tracker.cumulativePayout).toBe(1800);
        expect(tracker.qualifyingDaysAtLastPayout).toBe(4);
    });

    it('restores calendar-day gate progress after a payout as the anchor itself', () => {
        const plan = mffPlan(MffuVariant.Pro);
        expect(plan.payoutDayGateBasis).toBe(
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout,
        );
        const state = fundedState(plan, 52_000, 9);

        const tracker = restoreFundedCycleTracker(state, SEED);

        expect(tracker.cycleSnapshot(plan, state).dayGateProgress).toBe(6);
        expect(tracker.sessionDaysSinceAnchor).toBe(6);
    });

    it('restores first-payout calendar progress one past the anchor, and zero progress as no anchor yet', () => {
        const plan = mffPlan(MffuVariant.Pro);
        const state = fundedState(plan, 52_000, 3);

        const started = restoreFundedCycleTracker(state, {
            ...SEED,
            calendarDayGateProgress: 4,
            payoutsIssued: 0,
            qualifyingDaysAtLastPayout: 0,
        });
        expect(started.sessionDaysSinceAnchor).toBe(3);
        expect(started.cycleSnapshot(plan, state).dayGateProgress).toBe(4);

        const fresh = restoreFundedCycleTracker(state, {
            ...SEED,
            calendarDayGateProgress: 0,
            payoutsIssued: 0,
            qualifyingDaysAtLastPayout: 0,
        });
        expect(fresh.sessionDaysSinceAnchor).toBeNull();
        expect(fresh.cycleSnapshot(plan, state).dayGateProgress).toBe(0);
    });

    it('opens an after-reset tracker when the seed carries a funded reset, so the snapshot keeps the count', () => {
        const plan = mffPlan(MffuVariant.RapidEod);
        const state = fundedState(plan, 50_000, 0);

        const tracker = restoreFundedCycleTracker(state, {
            ...SEED,
            fundedResetsUsed: 1,
            payoutsIssued: 0,
            qualifyingDaysAtLastPayout: 0,
        });

        expect(tracker.cycleSnapshot(plan, state).fundedResetsUsed).toBe(1);
        expect(tracker.fundedResetsUsed).toBe(1);
    });

    it('is plain data that survives structuredClone and JSON unchanged', () => {
        expect(structuredClone(SEED)).toStrictEqual(SEED);
        const serialized = JSON.stringify(SEED);
        expect(JSON.parse(serialized)).toStrictEqual(SEED);
    });

    it('pays the next payout from the restored cycle exactly like a tracker that lived through it', () => {
        const plan = mffPlan(MffuVariant.RapidEod);
        const state = fundedState(plan, 52_000, 9);
        state.threshold = 50_100;
        state.thresholdLocked = true;

        const tracker = restoreFundedCycleTracker(state, {
            ...SEED,
            cycleBestDayProfit: 0,
        });
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });

        expect(payout?.debited).toBe(1000);
        expect(tracker.payoutsIssued).toBe(3);
        expect(tracker.cumulativePayout).toBeCloseTo(
            1800 + plan.payoutFromProfit(1000, 2),
            9,
        );
    });

    it('fails loud when the seed counts more qualifying days at the last payout than the account has', () => {
        const plan = mffPlan(MffuVariant.RapidEod);
        const state = fundedState(plan, 52_000, 3);

        expect(() => restoreFundedCycleTracker(state, SEED)).toThrow(
            /4 qualifying days at the last payout, more than the 3/,
        );
    });

    it.each([
        ['payoutsIssued', -1],
        ['payoutsIssued', 1.5],
        ['fundedResetsUsed', -1],
        ['fundedResetsUsed', 0.5],
        ['qualifyingDaysAtLastPayout', -2],
        ['qualifyingDaysAtLastPayout', 2.5],
        ['calendarDayGateProgress', -1],
        ['calendarDayGateProgress', 1.25],
        ['cumulativePayout', -0.01],
        ['cumulativePayout', NaN],
        ['cycleBestDayProfit', -5],
        ['lastPayoutBalance', Infinity],
    ] as const)('fails loud on %s = %s', (field, value) => {
        const plan = mffPlan(MffuVariant.RapidEod);
        const state = fundedState(plan, dollars(52_000), 9);

        expect(() =>
            restoreFundedCycleTracker(state, { ...SEED, [field]: value }),
        ).toThrow(RangeError);
    });
});
