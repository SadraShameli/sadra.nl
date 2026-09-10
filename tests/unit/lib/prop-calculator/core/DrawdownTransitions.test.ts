import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    createInitialState,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

function stateAt(balance: number, threshold: number, isLocked: boolean) {
    const state: AccountState = createInitialState(50_000, threshold);
    state.balance = balance;
    state.thresholdLocked = isLocked;
    return state;
}

function topStepPlan() {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard XFA 50K plan not found');
    return plan;
}

function trailingWithLock() {
    return new EodTrailingDrawdown({
        amount: dollars(2000),
        lock: {
            atProfit: dollars(2000),
            lockedThreshold: (startingBalance) => startingBalance,
        },
    });
}

describe('the drawdown floor only ever moves through a named transition', () => {
    it('ratchets upward and never downward', () => {
        const drawdown = trailingWithLock();
        const state = stateAt(51_000, 48_000, false);

        drawdown.onDayClose(state);
        expect(state.threshold).toBe(49_000);

        state.balance = 50_200;
        drawdown.onDayClose(state);
        expect(state.threshold).toBe(49_000);
    });

    it('latches the lock once and ignores every later ratchet', () => {
        const drawdown = trailingWithLock();
        const state = stateAt(52_000, 48_000, false);

        drawdown.onDayClose(state);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(50_000);

        state.balance = 60_000;
        drawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
    });

    it('cannot be re-locked to a different level once latched', () => {
        const drawdown = trailingWithLock();
        const state = stateAt(52_000, 51_000, true);

        drawdown.forceLock(state);
        expect(state.threshold).toBe(51_000);
        expect(state.thresholdLocked).toBe(true);
    });

    it('releases the floor downward, the one move a ratchet cannot express', () => {
        const drawdown = trailingWithLock();
        const state = stateAt(53_000, 51_000, true);

        drawdown.release(state, 50_000);
        expect(state.threshold).toBe(50_000);
        expect(state.thresholdLocked).toBe(true);
    });

    it('is idempotent, so releasing twice is not a second move', () => {
        const drawdown = trailingWithLock();
        const state = stateAt(53_000, 51_000, true);

        drawdown.release(state, 50_000);
        drawdown.release(state, 50_000);
        expect(state.threshold).toBe(50_000);
    });

    it('freezes a released floor against further trailing', () => {
        const drawdown = trailingWithLock();
        const state = stateAt(53_000, 51_000, false);

        drawdown.release(state, 50_000);
        state.balance = 70_000;
        drawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
    });

    it('releases TopStep to its funded starting balance, not to literal zero', () => {
        const plan = topStepPlan();
        const state = stateAt(52_400, 51_000, true);

        plan.fundedDrawdown.release(state, plan.accountSize);

        expect(state.threshold).toBe(50_000);
        expect(plan.fundedDrawdown.isBreached(state)).toBe(false);

        state.balance = 49_900;
        expect(plan.fundedDrawdown.isBreached(state)).toBe(true);
    });
});
