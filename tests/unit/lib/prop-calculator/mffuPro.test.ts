import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    DayStopRuleKind,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    PayoutFloorEffect,
    tryFundedPayout,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const mffu = new MyFundedFutures();

function pro() {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFFU Pro 50K plan not found');
    return plan;
}

describe('MFFU Pro 50K (live-verified 2026-09-14 against myfundedfutures.com/plans/pro raw page data)', () => {
    it('caps eval minis at 3 (funded-only 5) but scales micros at the standard 10:1 ratio (30, not 3), matching pro.md\'s directly-confirmed "3 mini / 30 micro" eval figure rather than the embedded JSON\'s bare "3" alone', () => {
        expect(pro().contractLimits?.evalMinis).toBe(3);
        expect(pro().contractLimits?.evalMicros).toBe(30);
    });

    it('keeps funded contracts flat at 5, unchanged from before', () => {
        const funded = pro().contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded contract limit for MFFU Pro',
            );
        }
        expect(funded.maxContracts).toBe(5);
        const fundedMicros = pro().contractLimits?.fundedMicros;
        if (fundedMicros?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded micro contract limit for MFFU Pro',
            );
        }
        expect(fundedMicros.maxContracts).toBe(5);
    });

    it(
        'requires 14 days after passing before the first payout, not 10 -- ' +
            "matching the live page's own initialWithdrawalDays:14 field and its " +
            "rendered 'Payout Timing: 14 days from first trade + buffer cleared' row",
        () => {
            expect(pro().minDaysAfterPassForPayout).toBe(14);
        },
    );
});

function fundedStateAt(balance: number) {
    const plan = pro();
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    state.balance = balance;
    plan.fundedDrawdown.onDayClose(state);
    return { plan, state, tracker };
}

describe('MFFU Pro 50K funded drawdown locks on the first payout (R1-51, pro.md: "After first payout, MLL moves to $50,100 and remains static")', () => {
    it('has a funded lock with no profit trigger that moves the MLL to start + $100 on the first payout', () => {
        const plan = pro();
        expect(plan.fundedDrawdown.lock?.atProfit).toBeNull();
        expect(plan.fundedDrawdown.lock?.lockedThreshold(50_000)).toBe(50_100);
        expect(plan.payoutFloorEffect).toBe(
            PayoutFloorEffect.MoveToLockedFloor,
        );
    });

    it('keeps the evaluation drawdown lock at +$2,100 unchanged', () => {
        expect(pro().drawdown.lock?.atProfit).toBe(2100);
    });

    it('keeps trailing the funded MLL at end of day before any payout', () => {
        const { state } = fundedStateAt(54_500);
        expect(state.threshold).toBe(52_500);
        expect(state.thresholdLocked).toBe(false);
    });

    it('pays the first payout above the $2,100 buffer and then moves the MLL down to $50,100', () => {
        const { plan, state, tracker } = fundedStateAt(50_000);
        state.balance = 54_500;
        state.threshold = 52_500;
        state.qualifyingDays = 14;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(2400);
        expect(payout?.traderReceives).toBe(1920);
        expect(state.balance).toBe(52_100);
        expect(state.threshold).toBe(50_100);
        expect(state.thresholdLocked).toBe(true);
    });

    it('never deadlocks: an always-winning trader passes, survives and gets paid', () => {
        const out = simulate({
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 120,
            maxEvalDays: 150,
            plan: pro(),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });
        expect(out.evalPassProbability).toBe(1);
        expect(out.fundedBustProbability).toBe(0);
        expect(out.expectedGrossPayout).toBeGreaterThan(0);
    });
});
