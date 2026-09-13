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

describe('Tradeify Lightning: payout cadence matches the live-published "Payout Frequency: 5 Days"', () => {
    it('requires 5 qualifying days between payouts, not 0', () => {
        expect(lightningPlan().minDaysAfterPassForPayout).toBe(5);
    });
});

describe("Tradeify: every plan's fees.reset is wired from its own resetFee field, not reused from evalCost", () => {
    it('Growth, Select Daily, and Select Flex each charge their own distinct reset fee, not their eval fee', () => {
        const growth = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        });
        const selectDaily = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectDaily,
        });
        const selectFlex = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectFlex,
        });
        if (!growth || !selectDaily || !selectFlex) {
            throw new Error('Tradeify 50K plan(s) not found');
        }

        expect(growth.fees.reset).toBe(95);
        expect(growth.fees.reset).not.toBe(growth.fees.oneTimeEval);

        expect(selectDaily.fees.reset).toBe(109);
        expect(selectDaily.fees.reset).not.toBe(selectDaily.fees.oneTimeEval);

        expect(selectFlex.fees.reset).toBe(109);
        expect(selectFlex.fees.reset).not.toBe(selectFlex.fees.oneTimeEval);
    });

    it("Lightning's fees.reset reads resetFee (492), matching the pattern used by every other Tradeify plan builder, rather than silently falling back to evalCost as a dead-field trap", () => {
        const plan = lightningPlan();
        expect(plan.fees.reset).toBe(492);
    });
});
