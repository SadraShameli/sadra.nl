import { describe, expect, it } from 'vitest';

import {
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    MffuVariant,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
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

function scriptedRng(draws: readonly number[]): Rng {
    let index = 0;
    return () => {
        const draw = draws[index];
        if (draw === undefined) throw new Error('scripted rng exhausted');
        index += 1;
        return draw;
    };
}

const losingDayPolicy: DayPolicy = {
    ladder: [500],
    maxLossesPerDay: null,
    stopRule: { kind: DayStopRuleKind.None },
};

describe('day.ts:89 qualifying-day characterization (current behaviour, pinned before any firm decision)', () => {
    it('MFFU Rapid has no minQualifyingDayProfit set today, so a net-losing traded day counts as qualifying', () => {
        const firm = new MyFundedFutures();
        const plan = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Rapid,
        });
        if (!plan) throw new Error('MFFU Rapid 50K plan not found');
        expect(plan.minQualifyingDayProfit).toBeNull();

        const state = plan.initialState();
        const stats = freshStats(state.startingBalance);
        const result = runDay({
            commission: dollars(0),
            dayPolicy: losingDayPolicy,
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rng: scriptedRng([0.99]),
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0),
        });

        expect(result.traded).toBe(true);
        expect(state.todayPnL).toBeLessThan(0);
        expect(state.qualifyingDays).toBe(1);
    });

    it('FundedNext Legacy has minQualifyingDayProfit $200 set, so the same net-losing day does NOT count as qualifying', () => {
        const firm = new FundedNext();
        const legacy = firm.plans.find(
            (p) => p.minQualifyingDayProfit !== null,
        );
        if (!legacy) {
            throw new Error(
                'No FundedNext plan with a qualifying-day threshold found',
            );
        }
        expect(legacy.minQualifyingDayProfit).toBe(200);

        const state = legacy.initialState();
        const stats = freshStats(state.startingBalance);
        const result = runDay({
            commission: dollars(0),
            dayPolicy: losingDayPolicy,
            phase: TradingPhase.Eval,
            plan: legacy,
            positionSizing: null,
            rng: scriptedRng([0.99]),
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0),
        });

        expect(result.traded).toBe(true);
        expect(state.todayPnL).toBeLessThan(0);
        expect(state.qualifyingDays).toBe(0);
    });
});
