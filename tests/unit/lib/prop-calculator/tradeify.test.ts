import { describe, expect, it } from 'vitest';

import { FirmId, TradeifyVariant } from '~/lib/prop-calculator/core';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';

const firm = new Tradeify();

function lightningPlan() {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Lightning,
    });
    if (!plan) throw new Error('Tradeify Lightning 50K plan not found');
    return plan;
}

describe('Tradeify Lightning: eval-phase DLL matches the live product (no separate eval phase, single continuous DLL from day one)', () => {
    it('locks out the day once losses exceed the $1,250 scaling DLL, in both eval and funded phase', () => {
        const plan = lightningPlan();

        const evalState = plan.initialState();
        evalState.balance -= 1500;
        evalState.todayPnL = -1500;
        expect(plan.isDayLockedOut(evalState, TradingPhase.Eval)).toBe(true);

        const fundedState = plan.initialState();
        fundedState.balance -= 1500;
        fundedState.todayPnL = -1500;
        expect(plan.isDayLockedOut(fundedState, TradingPhase.Funded)).toBe(
            true,
        );
    });

    it('does not lock out a loss under the $1,250 threshold', () => {
        const plan = lightningPlan();
        const state = plan.initialState();
        state.balance -= 1000;
        state.todayPnL = -1000;
        expect(plan.isDayLockedOut(state, TradingPhase.Eval)).toBe(false);
    });

    it('never busts the account on a DLL hit alone (DLL locks the day, not the account)', () => {
        const plan = lightningPlan();
        const state = plan.initialState();
        state.balance -= 1500;
        state.todayPnL = -1500;
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);
    });
});
