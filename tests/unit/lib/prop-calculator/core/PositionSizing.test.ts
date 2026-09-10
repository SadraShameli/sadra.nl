import { describe, expect, it } from 'vitest';

import {
    contracts,
    DayStopRuleKind,
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    points,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    capRiskToContractLimit,
    type PositionSizingConfig,
    resolveContractLimit,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core/PositionSizing';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { type Rng } from '~/lib/prop-calculator/rng';
import { runDay } from '~/lib/prop-calculator/simulator/day';
import {
    LossStreak,
    newPhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator/PhaseStats';

const NQ: PositionSizingConfig = {
    instrument: INSTRUMENTS[InstrumentSymbol.NQ],
    stopPoints: points(10),
};

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

describe('resolvePositionSizing', () => {
    it('returns null when instrument or stopPoints is missing', () => {
        expect(resolvePositionSizing(undefined, 10)).toBeNull();
        expect(
            resolvePositionSizing(InstrumentSymbol.NQ, undefined),
        ).toBeNull();
        expect(resolvePositionSizing(undefined, undefined)).toBeNull();
    });

    it('returns null for a non-positive or non-finite stop', () => {
        expect(resolvePositionSizing(InstrumentSymbol.NQ, 0)).toBeNull();
        expect(resolvePositionSizing(InstrumentSymbol.NQ, -5)).toBeNull();
        expect(resolvePositionSizing(InstrumentSymbol.NQ, NaN)).toBeNull();
    });

    it('resolves a valid instrument + stop into a config', () => {
        const config = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        expect(config).not.toBeNull();
        expect(config?.instrument.symbol).toBe(InstrumentSymbol.NQ);
        expect(config?.stopPoints).toBe(10);
    });
});

describe('capRiskToContractLimit', () => {
    it('leaves risk untouched when there is no contract limit', () => {
        expect(capRiskToContractLimit(5000, NQ, null)).toBe(5000);
    });

    it('leaves risk untouched when the implied contract count already fits (NQ $20/pt x 10pt stop = $200/contract, 3 contracts = $600 max)', () => {
        expect(capRiskToContractLimit(500, NQ, contracts(3))).toBe(500);
    });

    it('caps risk down to the maximum feasible whole-contract amount instead of the intended $1000 (5 contracts)', () => {
        expect(capRiskToContractLimit(1000, NQ, contracts(3))).toBe(600);
    });

    it('is a no-op when the instrument/stop pair implies zero risk per contract', () => {
        const degenerate: PositionSizingConfig = {
            instrument: { ...NQ.instrument, pointValue: 0 },
            stopPoints: points(10),
        };
        expect(capRiskToContractLimit(1000, degenerate, contracts(3))).toBe(
            1000,
        );
    });
});

describe('resolveContractLimit', () => {
    const topstep = new TopStep();
    const plan = topstep.plans[0];
    if (!plan) throw new Error('No TopStep plan registered');
    const limits = plan.contractLimits;
    if (!limits) throw new Error('TopStep plan has no contractLimits');

    it('returns null when the plan has no contract limits', () => {
        expect(
            resolveContractLimit(null, TradingPhase.Eval, false, 0),
        ).toBeNull();
    });

    it('reads the flat eval cap directly, ignoring accountProfit', () => {
        expect(resolveContractLimit(limits, TradingPhase.Eval, false, 0)).toBe(
            limits.evalMinis,
        );
        expect(
            resolveContractLimit(limits, TradingPhase.Eval, false, 999_999),
        ).toBe(limits.evalMinis);
    });

    it("resolves TopStep's funded tier by accountProfit (profit since funded), matching their $0-based XFA balance display", () => {
        expect(
            resolveContractLimit(limits, TradingPhase.Funded, false, 0),
        ).toBe(2);
        expect(
            resolveContractLimit(limits, TradingPhase.Funded, false, 1500),
        ).toBe(3);
        expect(
            resolveContractLimit(limits, TradingPhase.Funded, false, 2000),
        ).toBe(5);
    });

    it('would silently put every fresh funded account in the top tier if raw state.balance (which starts at accountSize) were passed instead of accountProfit - callers must pass accountProfit(state)', () => {
        expect(
            resolveContractLimit(limits, TradingPhase.Funded, false, 50_000),
        ).toBe(5);
    });
});

describe('runDay: position sizing actually caps a trade in the simulated day loop', () => {
    it('reduces a fresh funded-account trade to the 2-mini-tier feasible risk ($400 for NQ at a 10pt stop) and books the win off that capped size, not the intended $2000', () => {
        const topstep = new TopStep();
        const plan = topstep.plans[0];
        if (!plan) throw new Error('No TopStep plan registered');

        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const stats = freshStats(state.startingBalance);

        runDay({
            commission: dollars(0),
            dayPolicy: {
                ladder: [2000],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            },
            phase: TradingPhase.Funded,
            plan,
            positionSizing: NQ,
            rng: scriptedRng([0.01]),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(1),
        });

        expect(state.balance).toBe(state.startingBalance + 800);
    });
});
