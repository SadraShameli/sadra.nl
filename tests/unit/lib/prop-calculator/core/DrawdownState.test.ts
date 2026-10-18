import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AccountState,
    createInitialLiveAccountState,
    createInitialState,
    dollars,
    type DrawdownState,
    EodTrailingDrawdown,
    type LiveAccountState,
} from '~/lib/prop-calculator/core';

describe('N-15(b): AccountState always tracks the intraday reach, and drawdown rules read a narrower state', () => {
    it('types intradayHighProfit and peakIntradayProfit as required numbers, so no reader needs an undefined fallback', () => {
        expectTypeOf<
            AccountState['intradayHighProfit']
        >().toEqualTypeOf<number>();
        expectTypeOf<
            AccountState['peakIntradayProfit']
        >().toEqualTypeOf<number>();
    });

    it('starts both intraday fields at zero', () => {
        const state = createInitialState(50_000, 48_000);

        expect(state.intradayHighProfit).toBe(0);
        expect(state.peakIntradayProfit).toBe(0);
    });

    it('lets both account states feed a drawdown rule while the live state carries no intraday fields', () => {
        expectTypeOf<AccountState>().toExtend<DrawdownState>();
        expectTypeOf<LiveAccountState>().toExtend<DrawdownState>();
        expectTypeOf<LiveAccountState>().not.toHaveProperty(
            'intradayHighProfit',
        );
        expectTypeOf<LiveAccountState>().not.toHaveProperty(
            'peakIntradayProfit',
        );
    });

    it('ratchets and breaches a live account through the same drawdown rule', () => {
        const drawdown = new EodTrailingDrawdown({ amount: dollars(2000) });
        const state = createInitialLiveAccountState(0, -2000);

        state.balance = 500;
        drawdown.onDayClose(state);
        expect(state.threshold).toBe(-1500);

        state.balance = -1500;
        expect(drawdown.isBreached(state)).toBe(true);
    });
});
