import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    createInitialState,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    IntradayTrailingDrawdown,
    PayoutFloorEffect,
    StaticDrawdown,
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

function trailingWithOffsetLock() {
    return new EodTrailingDrawdown({
        amount: dollars(2000),
        lock: {
            atProfit: dollars(2100),
            lockedThreshold: (startingBalance) => startingBalance + 100,
        },
    });
}

function trailingWithPayoutOnlyLock() {
    return new EodTrailingDrawdown({
        amount: dollars(2000),
        lock: {
            atProfit: null,
            lockedThreshold: (startingBalance) => startingBalance + 100,
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

    it('locks at the documented floor even when the qualifying day overshoots the trigger', () => {
        const drawdown = trailingWithOffsetLock();
        const state = stateAt(52_500, 48_000, false);

        drawdown.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(50_100);
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

describe('intradayLockDistance is how much more intraday gain locks the floor', () => {
    const offsetLock = {
        atProfit: dollars(2100),
        lockedThreshold: (startingBalance: number) => startingBalance + 100,
    };

    it('is the full lock trigger on a fresh intraday trailing account', () => {
        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
            lock: offsetLock,
        });
        expect(
            drawdown.intradayLockDistance(stateAt(50_000, 48_000, false)),
        ).toBe(2100);
    });

    it('shrinks by the profit already made', () => {
        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
            lock: offsetLock,
        });
        expect(
            drawdown.intradayLockDistance(stateAt(50_500, 48_500, false)),
        ).toBe(1600);
    });

    it('is Infinity once the floor is locked', () => {
        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
            lock: offsetLock,
        });
        expect(
            drawdown.intradayLockDistance(stateAt(52_200, 50_100, true)),
        ).toBe(Infinity);
    });

    it('is Infinity for an intraday trailing drawdown with no lock', () => {
        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
        });
        expect(
            drawdown.intradayLockDistance(stateAt(50_000, 48_000, false)),
        ).toBe(Infinity);
    });

    it('is Infinity for end-of-day trailing and static drawdowns, whose floor cannot move intraday', () => {
        const state = stateAt(50_000, 48_000, false);
        expect(trailingWithOffsetLock().intradayLockDistance(state)).toBe(
            Infinity,
        );
        expect(
            new StaticDrawdown({
                amount: dollars(2000),
                lock: offsetLock,
            }).intradayLockDistance(state),
        ).toBe(Infinity);
    });
});

describe('a lock with no profit trigger fires only through a payout (R1-51)', () => {
    it('keeps trailing on every day close, however high profit climbs', () => {
        const drawdown = trailingWithPayoutOnlyLock();
        const state = stateAt(54_500, 48_000, false);

        drawdown.onDayClose(state);

        expect(state.threshold).toBe(52_500);
        expect(state.thresholdLocked).toBe(false);
    });

    it('moves a trailed floor down to the locked value and locks it', () => {
        const drawdown = trailingWithPayoutOnlyLock();
        const state = stateAt(54_500, 52_500, false);

        drawdown.moveToLock(state);

        expect(state.threshold).toBe(50_100);
        expect(state.thresholdLocked).toBe(true);

        state.balance = 60_000;
        drawdown.onDayClose(state);
        expect(state.threshold).toBe(50_100);
    });

    it('moves a floor below the locked value up to it', () => {
        const drawdown = trailingWithPayoutOnlyLock();
        const state = stateAt(51_000, 49_000, false);

        drawdown.moveToLock(state);

        expect(state.threshold).toBe(50_100);
        expect(state.thresholdLocked).toBe(true);
    });

    it('is idempotent once locked', () => {
        const drawdown = trailingWithPayoutOnlyLock();
        const state = stateAt(53_000, 51_000, true);

        drawdown.moveToLock(state);
        drawdown.moveToLock(state);

        expect(state.threshold).toBe(51_000);
        expect(state.thresholdLocked).toBe(true);
    });

    it('does nothing on a drawdown with no lock', () => {
        const drawdown = new EodTrailingDrawdown({ amount: dollars(2000) });
        const state = stateAt(54_500, 52_500, false);

        drawdown.moveToLock(state);

        expect(state.threshold).toBe(52_500);
        expect(state.thresholdLocked).toBe(false);
    });

    it('never locks an intraday trailing drawdown on a trade', () => {
        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
            lock: {
                atProfit: null,
                lockedThreshold: (startingBalance) => startingBalance + 100,
            },
        });
        const state = stateAt(55_000, 48_000, false);

        drawdown.onTrade(state, 5000);

        expect(state.threshold).toBe(53_000);
        expect(state.thresholdLocked).toBe(false);
        expect(drawdown.intradayLockDistance(state)).toBe(Infinity);
    });
});

describe('prospectiveLockThreshold is the floor a payout would leave behind', () => {
    it('is the locked value for MoveToLockedFloor, even below a trailed floor', () => {
        const state = stateAt(54_500, 52_500, false);
        expect(
            trailingWithPayoutOnlyLock().prospectiveLockThreshold(
                state,
                PayoutFloorEffect.MoveToLockedFloor,
            ),
        ).toBe(50_100);
    });

    it('keeps the higher trailed floor for LockAtPlanFloor', () => {
        const state = stateAt(54_500, 52_500, false);
        expect(
            trailingWithOffsetLock().prospectiveLockThreshold(
                state,
                PayoutFloorEffect.LockAtPlanFloor,
            ),
        ).toBe(52_500);
    });

    it('raises a lower floor to the locked value for LockAtPlanFloor', () => {
        const state = stateAt(50_500, 48_500, false);
        expect(
            trailingWithOffsetLock().prospectiveLockThreshold(
                state,
                PayoutFloorEffect.LockAtPlanFloor,
            ),
        ).toBe(50_100);
    });

    it('is the current threshold once locked or without a lock', () => {
        const locked = stateAt(54_500, 51_000, true);
        expect(
            trailingWithPayoutOnlyLock().prospectiveLockThreshold(
                locked,
                PayoutFloorEffect.MoveToLockedFloor,
            ),
        ).toBe(51_000);
        const unlocked = stateAt(54_500, 52_500, false);
        expect(
            new EodTrailingDrawdown({
                amount: dollars(2000),
            }).prospectiveLockThreshold(
                unlocked,
                PayoutFloorEffect.MoveToLockedFloor,
            ),
        ).toBe(52_500);
    });
});
