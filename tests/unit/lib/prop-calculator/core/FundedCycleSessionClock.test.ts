import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    PayoutTotals,
    runFundedDays,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

const mffu = new MyFundedFutures();

function fundedStart(plan: Plan) {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return { state, tracker: newFundedCycleTracker(state) };
}

function pro(): Plan {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFFU Pro 50K plan not found');
    return plan;
}

function simulatedPayouts(idleDayProbability: number, seed: number) {
    const plan = pro();
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const totals = new TradeTotals();
    const sink = new PayoutTotals();
    const result = runFundedDays({
        commission: dollars(0),
        dayOffsetBase: 0,
        dayPolicy: flatDayPolicy(250, 1, { kind: DayStopRuleKind.None }),
        discounts: undefined,
        equityCurve: null,
        idleDayProbability,
        maxDays: 60,
        minRetainedCushion: plan.resolveRetainedCushion(undefined),
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        rng: mulberry32(seed),
        rrRatio: 2,
        rungSizing: DEFAULT_RUNG_SIZING,
        sink,
        state,
        stats: newPhaseStats(state.balance, totals, new LossStreak(totals)),
        winrate: fraction(1),
    });
    return {
        count: sink.count,
        daysElapsed: result.daysElapsed,
        firstPayoutDay: sink.firstPayoutDay,
        total: sink.total,
    };
}

describe('WP18i hardening: the calendar payout clock advances through an explicit per-session hook, not inside FundedCycleTracker.tryPayout', () => {
    it('leaves the clock alone when a payout is tried twice in one session', () => {
        const plan = pro();
        const { state, tracker } = fundedStart(plan);
        const options = {
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            state,
        };

        tracker.tryPayout(options);
        tracker.tryPayout(options);

        expect(tracker.sessionDaysSinceAnchor).toBeNull();
        expect(tracker.dayGateProgress(plan, state)).toBe(0);
    });

    it('anchors on the first traded session close and advances once per recorded session', () => {
        const plan = pro();
        const { state, tracker } = fundedStart(plan);

        state.consecutiveIdleDays = 1;
        tracker.recordSessionClose(state);
        expect(tracker.sessionDaysSinceAnchor).toBeNull();

        state.consecutiveIdleDays = 0;
        tracker.recordSessionClose(state);
        expect(tracker.sessionDaysSinceAnchor).toBe(0);
        expect(tracker.dayGateProgress(plan, state)).toBe(1);

        state.consecutiveIdleDays = 1;
        tracker.recordSessionClose(state);
        tracker.recordSessionClose(state);
        expect(tracker.sessionDaysSinceAnchor).toBe(2);
        expect(tracker.dayGateProgress(plan, state)).toBe(3);
    });

    it.each([
        [
            0,
            1,
            { count: 5, daysElapsed: 60, firstPayoutDay: 11, total: 18_720 },
        ],
        [
            0.3,
            7,
            { count: 5, daysElapsed: 60, firstPayoutDay: 13, total: 12_320 },
        ],
    ])(
        'keeps the simulated MFF Pro payout schedule pinned before the change (idle probability %s, seed %s)',
        (idleDayProbability, seed, expected) => {
            expect(simulatedPayouts(idleDayProbability, seed)).toStrictEqual(
                expected,
            );
        },
    );
});
