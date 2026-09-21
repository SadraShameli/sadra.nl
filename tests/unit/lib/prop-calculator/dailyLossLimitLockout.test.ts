import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    type Plan,
    type PlanId,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error('plan not found');
    return plan;
}

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

const alwaysLoses: Rng = () => 0.999;

function fourLosingRungs(): DayPolicy {
    return {
        ladder: [400, 400, 400, 400],
        maxLossesPerDay: null,
        stopRule: { kind: DayStopRuleKind.None },
    };
}

describe('a daily-loss-limit breach stops the day, it does not kill the account', () => {
    it('halts the rung ladder at the limit instead of busting', () => {
        const state = apexEod.initialState();
        const stats = freshStats(state.startingBalance);

        const result = runDay({
            commission: dollars(0),
            dayPolicy: fourLosingRungs(),
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(result.traded).toBe(true);
        expect(state.todayPnL).toBe(-1000);
        expect(state.balance).toBe(49_000);
        expect(stats.tradesTaken).toBe(3);
        expect(apexEod.isDayLockedOut(state, TradingPhase.Eval)).toBe(true);
    });

    it("caps the rung that would cross the limit to the remaining room, it doesn't let it lose in full", () => {
        const state = apexEod.initialState();
        const stats = freshStats(state.startingBalance);

        runDay({
            commission: dollars(0),
            dayPolicy: fourLosingRungs(),
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0),
        });

        expect(state.todayPnL).toBe(-1000);
        expect(stats.totals.grossLosses).toBe(400 + 400 + 200);
    });

    it('lets the account keep trading on the following day', () => {
        const state = apexEod.initialState();
        const stats = freshStats(state.startingBalance);
        const base = {
            commission: dollars(0),
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0),
        };

        runDay({ ...base, dayPolicy: fourLosingRungs(), rng: alwaysLoses });
        expect(state.balance).toBe(49_000);
        expect(state.tradingDays).toBe(1);
        expect(stats.tradesTaken).toBe(3);

        const second = runDay({
            ...base,
            dayPolicy: fourLosingRungs(),
            rng: alwaysLoses,
        });

        expect(stats.tradesTaken).toBe(6);
        expect(second.busted).toBe(true);
        expect(state.balance).toBe(state.threshold);
    });

    it('still busts when the drawdown floor is breached on the same day', () => {
        const state = apexEod.initialState();
        const stats = freshStats(state.startingBalance);
        state.balance = state.threshold + 300;

        const result = runDay({
            commission: dollars(0),
            dayPolicy: fourLosingRungs(),
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(true);
    });
});
