import { describe, expect, it } from 'vitest';

import {
    dollars,
    type DrawdownStrategy,
    fraction,
    LivePlan,
    StaticDrawdown,
    StrictlyBelowStaticDrawdown,
} from '~/lib/prop-calculator/core';

function floorPlan(drawdown: DrawdownStrategy): LivePlan {
    return new LivePlan({
        cushionPercent: { postLock: fraction(0.05), preLock: fraction(0.05) },
        label: 'Floor Live',
        liveDailyLossLimit: null,
        liveDrawdown: drawdown,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        requiresLockForWithdrawal: false,
        startingBalance: dollars(10_000),
    });
}

function plain(): LivePlan {
    return floorPlan(new StaticDrawdown({ amount: dollars(9000) }));
}

function strict(): LivePlan {
    return floorPlan(
        new StrictlyBelowStaticDrawdown({ amount: dollars(9000) }),
    );
}

function withdrawableAt(plan: LivePlan, profit: number, retained: number) {
    const state = plan.initialState();
    state.balance = state.startingBalance + profit;
    return { amount: plan.withdrawableAmount(state, dollars(retained)), state };
}

describe('LivePlan.withdrawableAmount at a strictly-below floor (WP62c, N-94)', () => {
    it('drains to exactly the floor, which is still alive, since the firm busts only below it', () => {
        const { amount } = withdrawableAt(strict(), 2000, 0);

        expect(amount).toBe(11_000);
    });

    it('leaves the account alive on the floor after the withdrawal', () => {
        const plan = strict();
        const { amount, state } = withdrawableAt(plan, 2000, 0);
        plan.withdraw(state, amount);

        expect(state.balance).toBe(state.threshold);
        expect(plan.isBust(state)).toBe(false);
    });

    it('keeps a requested retained cushion on top of the floor', () => {
        const { amount } = withdrawableAt(strict(), 2000, 500);

        expect(amount).toBe(10_500);
    });

    it('still keeps one cent above the floor on a plain static floor, where landing on it busts', () => {
        const { amount } = withdrawableAt(plain(), 2000, 0);

        expect(amount).toBe(10_999.99);
    });

    it('pays nothing from a balance already on the strict floor', () => {
        const { amount } = withdrawableAt(strict(), -9000, 0);

        expect(amount).toBe(0);
    });
});
