import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    type Plan,
    type PlanId,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error(`plan ${JSON.stringify(id)} not found`);
    return plan;
}

const apexIntraday = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
});

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

function countingRng(seed: number): { draws: () => number; rng: Rng } {
    const inner = mulberry32(seed);
    let count = 0;
    return {
        draws: () => count,
        rng: () => {
            count += 1;
            return inner();
        },
    };
}

function drawsForOneTrade(
    plan: Plan,
    phase: TradingPhase,
    intradayPathStepsPerR: number | undefined,
): number {
    const state = plan.initialState();
    const totals = new TradeTotals();
    const stats = newPhaseStats(
        state.startingBalance,
        totals,
        new LossStreak(totals),
    );
    const counter = countingRng(1);
    runDay({
        commission: dollars(0),
        dayPolicy: flatDayPolicy(250, 1, { kind: DayStopRuleKind.None }),
        intradayPathStepsPerR,
        phase,
        plan,
        positionSizing: null,
        rng: counter.rng,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        state,
        stats,
        winrate: fraction(0.4),
    });
    return counter.draws();
}

describe('runDay intraday path walk scope (R1-26)', () => {
    it('applies the intraday path walk in the eval phase of an intraday-trailing plan', () => {
        expect(
            drawsForOneTrade(apexIntraday, TradingPhase.Eval, 10),
        ).toBeGreaterThanOrEqual(10);
    });

    it('uses exactly one draw per trade in the eval phase without --path-granularity', () => {
        expect(
            drawsForOneTrade(apexIntraday, TradingPhase.Eval, undefined),
        ).toBe(1);
    });

    it('does not path-walk a plan whose phase drawdown is not intraday trailing', () => {
        expect(drawsForOneTrade(apexEod, TradingPhase.Eval, 10)).toBe(1);
    });

    it('applies the path walk in the funded phase too', () => {
        expect(
            drawsForOneTrade(apexIntraday, TradingPhase.Funded, 10),
        ).toBeGreaterThanOrEqual(10);
    });
});
