import { describe, expect, it } from 'vitest';

import {
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    LucidVariant,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
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

const firm = new LucidTrading();

function proPlan() {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.Pro,
    });
    if (!plan) throw new Error('LucidPro 50K plan not found');
    return plan;
}

function scriptedRng(draws: readonly number[]): Rng {
    let index = 0;
    return () => {
        const draw = draws[index];
        if (draw === undefined) throw new Error('scripted rng exhausted');
        index += 1;
        return draw;
    };
}

function unevenPolicy(ladder: readonly number[]): DayPolicy {
    return {
        ladder,
        maxLossesPerDay: null,
        stopRule: { kind: DayStopRuleKind.None },
    };
}

describe('peak day-close profit', () => {
    it('ratchets up on a winning day and holds through a losing day', () => {
        const plan = proPlan();
        const state = plan.initialState();
        const stats = freshStats(state.startingBalance);
        const base = {
            commission: dollars(0),
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
        };

        runDay({
            ...base,
            dayPolicy: flatDayPolicy(1000, 1),
            rng: scriptedRng([0]),
            winrate: fraction(1),
        });
        expect(state.balance).toBe(51_000);
        expect(state.peakDayCloseProfit).toBe(1000);

        runDay({
            ...base,
            dayPolicy: flatDayPolicy(500, 1),
            rng: scriptedRng([0.99]),
            winrate: fraction(0),
        });
        expect(state.balance).toBe(50_500);
        expect(state.peakDayCloseProfit).toBe(1000);
    });

    it('ignores an intraday high that retraces before the close', () => {
        const plan = proPlan();
        const state = plan.initialState();
        const stats = freshStats(state.startingBalance);

        runDay({
            commission: dollars(0),
            dayPolicy: unevenPolicy([100, 500]),
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rng: scriptedRng([0.1, 0.9]),
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.5),
        });

        expect(state.balance).toBe(49_600);
        expect(state.peakDayCloseProfit).toBe(0);
    });

    it('is measured from the account starting balance', () => {
        const plan = proPlan();
        const state = plan.initialState();
        const stats = freshStats(state.startingBalance);
        const base = {
            commission: dollars(0),
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(1),
        };

        runDay({
            ...base,
            dayPolicy: flatDayPolicy(2500, 1),
            rng: scriptedRng([0]),
        });
        expect(state.balance).toBe(52_000);
        expect(state.thresholdLocked).toBe(false);
        expect(state.peakDayCloseProfit).toBe(2000);

        runDay({
            ...base,
            dayPolicy: flatDayPolicy(200, 1),
            rng: scriptedRng([0]),
        });
        expect(state.balance).toBe(52_200);
        expect(state.thresholdLocked).toBe(true);
        expect(state.peakDayCloseProfit).toBe(2200);

        expect(plan.profitFor(state)).toBe(2200);
        expect(state.peakDayCloseProfit).toBe(2200);
    });

    it('does not shrink when a withdrawal reduces the balance', () => {
        const plan = proPlan();
        const state = plan.initialState();
        state.balance = 54_000;
        plan.recordDayClosePeak(state);
        expect(state.peakDayCloseProfit).toBe(4000);

        state.balance = 52_000;
        plan.recordDayClosePeak(state);
        expect(state.peakDayCloseProfit).toBe(4000);
    });
});
