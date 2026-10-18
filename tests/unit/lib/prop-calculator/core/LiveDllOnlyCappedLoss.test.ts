import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    fraction,
    InstrumentSymbol,
    LivePlan,
    resolveLiveRiskAt,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';

const resolvedPositionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 22.5);
if (resolvedPositionSizing === null) {
    throw new Error('expected a position size');
}
const positionSizing = resolvedPositionSizing;

function dailyLimitOnlyPlan(): LivePlan {
    return new LivePlan({
        cushionPercent: { postLock: fraction(0.05), preLock: fraction(0.05) },
        label: 'Daily Limit Only Live',
        liveDailyLossLimit: {
            amount: dollars(2000),
            kind: DailyLossLimitKind.Flat,
        },
        liveDrawdown: null,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function sizeAtBalance(balance: number) {
    const plan = dailyLimitOnlyPlan();
    const state = plan.initialState();
    state.balance = balance;
    return resolveLiveRiskAt({
        commission: dollars(0),
        plan,
        positionSizing,
        state,
    });
}

describe('resolveLiveRiskAt on a live plan with no drawdown, only a daily loss limit (WP62c)', () => {
    it.each([0.01, 100, 300, 449.99])(
        'caps the one-contract stop to the $%d balance, since no floor exists for the loss to land short of',
        (balance) => {
            expect(sizeAtBalance(balance)).toStrictEqual({
                rewardRisk: 450,
                risk: balance,
            });
        },
    );

    it.each([
        { balance: 450, expected: 450 },
        { balance: 9000, expected: 450 },
        { balance: 20_000, expected: 900 },
    ])(
        'places the whole stop once the balance of $balance covers one contract',
        ({ balance, expected }) => {
            expect(sizeAtBalance(balance)).toStrictEqual({
                rewardRisk: expected,
                risk: expected,
            });
        },
    );

    it('places nothing at a balance of 0', () => {
        expect(sizeAtBalance(0)).toStrictEqual({ rewardRisk: 0, risk: 0 });
    });
});
