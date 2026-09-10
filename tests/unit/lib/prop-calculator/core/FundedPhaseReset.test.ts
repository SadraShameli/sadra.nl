import { describe, expect, it } from 'vitest';

import {
    FirmId,
    LucidVariant,
    MffuVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

function lucidPro() {
    const plan = new LucidTrading().findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.Pro,
    });
    if (!plan) throw new Error('LucidPro 50K plan not found');
    return plan;
}

function passedEvalState(plan: ReturnType<typeof rapidEod>) {
    const state = plan.initialState();
    state.balance = 53_400;
    state.bestDayProfit = 1800;
    state.peakDayCloseProfit = 3400;
    state.qualifyingDays = 7;
    state.threshold = 51_400;
    state.thresholdLocked = true;
    state.todayPnL = 600;
    state.tradingDays = 12;
    return state;
}

function rapidEod() {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('funded phase starts a fresh account', () => {
    it('does not carry the eval balance into the funded account', () => {
        const plan = rapidEod();
        const state = passedEvalState(plan);

        plan.beginFundedPhase(state);

        expect(state.balance).toBe(plan.accountSize);
        expect(plan.profitFor(state)).toBe(0);
    });

    it('does not carry the eval drawdown threshold or its lock', () => {
        const plan = rapidEod();
        const state = passedEvalState(plan);

        plan.beginFundedPhase(state);

        expect(state.threshold).toBe(
            plan.fundedDrawdown.initialThreshold(plan.accountSize),
        );
        expect(state.thresholdLocked).toBe(false);
        expect(state.balance - state.threshold).toBe(
            plan.fundedDrawdown.amount,
        );
    });

    it('does not carry the eval peak, day counters, or open day', () => {
        const plan = rapidEod();
        const state = passedEvalState(plan);

        plan.beginFundedPhase(state);

        expect(state.peakDayCloseProfit).toBe(0);
        expect(state.bestDayProfit).toBe(0);
        expect(state.qualifyingDays).toBe(0);
        expect(state.tradingDays).toBe(0);
        expect(state.todayPnL).toBe(0);
    });

    it('opens Lucid Pro funded on the fixed DLL, not the scaling one', () => {
        const plan = lucidPro();
        const state = passedEvalState(plan);

        plan.beginFundedPhase(state);

        const context = plan.dailyLossLimitContext(state);
        expect(context.isThresholdLocked).toBe(false);
        expect(context.peakDayCloseProfit).toBe(0);
    });

    it('leaves a funded account that cannot bust before it has traded', () => {
        for (const plan of [rapidEod(), lucidPro()]) {
            const state = passedEvalState(plan);
            plan.beginFundedPhase(state);
            expect(plan.isBust(state, TradingPhase.Funded)).toBe(false);
        }
    });
});
