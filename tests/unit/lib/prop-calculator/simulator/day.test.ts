import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    ApexVariant,
    computedDayPolicy,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    type FundedCycleSnapshot,
    InstrumentSymbol,
    type Plan,
    type PlanId,
    PolicySizing,
    resolvePositionSizing,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    type DayRunOptions,
    LossStreak,
    newPhaseStats,
    resolveDayPolicy,
    runDay,
    type SimInputs,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { dayRunOptionsFor } from '../dayRunOptions';

describe('runDay options are discriminated by phase (WP23)', () => {
    it('requires the funded cycle snapshot on a funded day, so a funded policy never falls back to a fresh cycle', () => {
        expectTypeOf<
            Extract<
                DayRunOptions,
                { phase: TradingPhase.Funded }
            >['fundedCycle']
        >().toEqualTypeOf<FundedCycleSnapshot>();
    });

    it('has no funded cycle on an eval day', () => {
        expectTypeOf<
            Extract<DayRunOptions, { phase: TradingPhase.Eval }>
        >().not.toHaveProperty('fundedCycle');
        expectTypeOf<
            Extract<DayRunOptions, { phase: TradingPhase.Eval }>
        >().toHaveProperty('phase');
    });
});

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
    runDay(
        dayRunOptionsFor(phase, {
            commission: dollars(0),
            dayPolicy: flatDayPolicy(250, 1, { kind: DayStopRuleKind.None }),
            intradayPathStepsPerR,
            plan,
            positionSizing: null,
            rng: counter.rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        }),
    );
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

function fundedLossWith(dayPolicy: DayPolicy): number {
    const state = apexEod.initialState();
    apexEod.beginFundedPhase(state);
    const startingBalance = state.balance;
    const totals = new TradeTotals();
    const positionSizing = resolvePositionSizing(InstrumentSymbol.MNQ, 10);
    const stats = newPhaseStats(state.balance, totals, new LossStreak(totals));
    runDay(
        dayRunOptionsFor(TradingPhase.Funded, {
            commission: dollars(0),
            dayPolicy,
            plan: apexEod,
            positionSizing,
            rng: () => 0.99,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        }),
    );
    return state.balance - startingBalance;
}

function sizingInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 20,
        instrument: InstrumentSymbol.MNQ,
        maxEvalDays: 20,
        plan: apexEod,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        stopPoints: 10,
        tradesPerDay: 2,
        trials: 1,
        winrate: 0.4,
        ...overrides,
    };
}

describe('runDay places risk by the policy sizing field, not by a hidden marker (T33, R4, R9)', () => {
    it('loses 12 MNQ micros ($240) on a WholeContracts policy and the full $250 on a ContractCapped one, at a 10 point stop', () => {
        expect(
            fundedLossWith(
                flatDayPolicy(250, 1, undefined, PolicySizing.WholeContracts),
            ),
        ).toBe(-240);
        expect(fundedLossWith(flatDayPolicy(250, 1))).toBe(-250);
    });

    it('treats a declared policy with no sizing field as ContractCapped', () => {
        expect(
            fundedLossWith({
                ladder: [250],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            }),
        ).toBe(-250);
    });

    it('places a computed WholeContracts policy in whole contracts too', () => {
        expect(
            fundedLossWith(
                computedDayPolicy(
                    () => 250,
                    1,
                    undefined,
                    PolicySizing.WholeContracts,
                ),
            ),
        ).toBe(-240);
    });
});

describe('resolveDayPolicy sets the sizing of every policy it builds (T33, U18)', () => {
    it('builds the funded flat and percent-of-cushion policies as WholeContracts and the eval flat policy as ContractCapped', () => {
        const percentInputs = sizingInputs({
            fundedCushionPercent: fraction(0.25),
        });
        expect(
            resolveDayPolicy(sizingInputs(), TradingPhase.Funded).sizing,
        ).toBe(PolicySizing.WholeContracts);
        expect(
            resolveDayPolicy(percentInputs, TradingPhase.Funded).sizing,
        ).toBe(PolicySizing.WholeContracts);
        expect(resolveDayPolicy(sizingInputs(), TradingPhase.Eval).sizing).toBe(
            PolicySizing.ContractCapped,
        );
    });

    it('returns a declared policy exactly as declared, so a declared ladder keeps its own sizing', () => {
        const declared: DayPolicy = {
            ladder: [250, 500],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        };
        expect(
            resolveDayPolicy(
                sizingInputs({ evalDayPolicy: declared }),
                TradingPhase.Eval,
            ),
        ).toBe(declared);
        expect(
            resolveDayPolicy(
                sizingInputs({ fundedDayPolicy: declared }),
                TradingPhase.Funded,
            ),
        ).toBe(declared);
    });
});
