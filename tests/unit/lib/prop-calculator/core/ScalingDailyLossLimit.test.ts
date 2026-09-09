import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    FirmId,
    LucidVariant,
    resolveDailyLossLimit,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const lucid = new LucidTrading();

const SCALING_VARIANTS: readonly (LucidVariant.Direct | LucidVariant.Pro)[] = [
    LucidVariant.Pro,
    LucidVariant.Direct,
];

const FIXED_DLL = 1200;
const INITIAL_TRAIL_BALANCE = 52_100;
const LOCKED_THRESHOLD = 50_100;

function fundedDll(
    variant: LucidVariant.Direct | LucidVariant.Pro,
    options: { isThresholdLocked: boolean; peak: number },
): null | number {
    const plan = lucidPlan(variant);
    return resolveDailyLossLimit(plan.fundedDailyLossLimit, {
        isThresholdLocked: options.isThresholdLocked,
        peakDayCloseProfit: options.peak,
        profit: options.peak,
    });
}

function lockedFundedState(peak: number, todayPnL: number) {
    const plan = lucidPlan(LucidVariant.Pro);
    const state = plan.initialState();
    state.balance = 50_000 + peak;
    state.threshold = LOCKED_THRESHOLD;
    state.thresholdLocked = true;
    state.fundingBaseline = 50_000;
    state.peakDayCloseProfit = peak;
    state.todayPnL = todayPnL;
    return { plan, state };
}

function lucidPlan(variant: LucidVariant.Direct | LucidVariant.Pro) {
    const plan = lucid.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant,
    });
    if (!plan) throw new Error(`Lucid ${variant} 50K plan not found`);
    return plan;
}

describe.each(SCALING_VARIANTS)('Lucid %s scaling DLL', (variant) => {
    it('is staged on the trail lock, not flat', () => {
        expect(lucidPlan(variant).fundedDailyLossLimit.kind).toBe(
            DailyLossLimitKind.AfterThresholdLock,
        );
    });

    it('holds the fixed $1,200 below the Initial Trail Balance', () => {
        expect(fundedDll(variant, { isThresholdLocked: false, peak: 0 })).toBe(
            FIXED_DLL,
        );
        expect(
            fundedDll(variant, { isThresholdLocked: false, peak: 8000 }),
        ).toBe(FIXED_DLL);
    });

    it('scales at 60% of peak end-of-day profit once locked', () => {
        expect(
            fundedDll(variant, { isThresholdLocked: true, peak: 4000 }),
        ).toBe(2400);
        expect(
            fundedDll(variant, { isThresholdLocked: true, peak: 10_000 }),
        ).toBe(6000);
    });

    it('does not decrease across the activation boundary', () => {
        const activationPeak = INITIAL_TRAIL_BALANCE - 50_000;
        const before = fundedDll(variant, {
            isThresholdLocked: false,
            peak: activationPeak,
        });
        const after = fundedDll(variant, {
            isThresholdLocked: true,
            peak: activationPeak,
        });
        expect(before).toBe(FIXED_DLL);
        expect(after).toBe(1260);
        expect(after).toBeGreaterThan(before ?? 0);
    });

    it('keeps the eval phase on the fixed DLL even once the trail has locked', () => {
        const plan = lucidPlan(variant);
        const state = plan.initialState();
        state.balance = 54_000;
        state.thresholdLocked = true;
        state.peakDayCloseProfit = 4000;

        expect(
            resolveDailyLossLimit(
                plan.dailyLossLimitFor(TradingPhase.Eval),
                plan.dailyLossLimitContext(state, TradingPhase.Eval),
            ),
        ).toBe(FIXED_DLL);
    });
});

describe('Lucid scaling DLL through isBust', () => {
    it('busts on a day that loses the full 60% of peak', () => {
        const { plan, state } = lockedFundedState(4000, -2400);
        expect(plan.isBust(state, TradingPhase.Funded)).toBe(true);
    });

    it('survives a day one dollar inside the scaled limit', () => {
        const { plan, state } = lockedFundedState(4000, -2399);
        expect(plan.isBust(state, TradingPhase.Funded)).toBe(false);
    });

    it('would have busted on the same day under the pre-lock fixed limit', () => {
        const { plan, state } = lockedFundedState(4000, -1200);
        expect(plan.isBust(state, TradingPhase.Funded)).toBe(false);

        state.thresholdLocked = false;
        expect(plan.isBust(state, TradingPhase.Funded)).toBe(true);
    });

    it('does not tighten the limit after a withdrawal reduces the balance', () => {
        const { plan, state } = lockedFundedState(4000, 0);
        const before = plan.dailyLossLimitContext(state, TradingPhase.Funded);

        state.balance -= 2000;
        plan.recordDayClosePeak(state);
        const after = plan.dailyLossLimitContext(state, TradingPhase.Funded);

        expect(after.peakDayCloseProfit).toBe(before.peakDayCloseProfit);
        expect(resolveDailyLossLimit(plan.fundedDailyLossLimit, after)).toBe(
            2400,
        );
    });
});
