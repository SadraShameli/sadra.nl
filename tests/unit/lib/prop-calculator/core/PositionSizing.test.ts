import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    type ContractLimits,
    contracts,
    DayStopRuleKind,
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type Plan,
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

const SCALING_TIERS = [
    { maxContracts: contracts(1), minBalance: dollars(0) },
    { maxContracts: contracts(5), minBalance: dollars(300) },
] as const;

const FROZEN_TIER_LIMITS: ContractLimits = {
    evalMicros: contracts(70),
    evalMinis: contracts(7),
    fundedMicros: null,
    fundedMinis: {
        isEffectiveNextSession: true,
        kind: ContractLimitKind.Tiered,
        tiers: SCALING_TIERS,
    },
};

const LIVE_TIER_LIMITS: ContractLimits = {
    evalMicros: contracts(70),
    evalMinis: contracts(7),
    fundedMicros: null,
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tiers: SCALING_TIERS,
    },
};

const TRADES_PER_DAY = 2;
const RUNG_RISK = 1000;

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

function fundedTieredPlan(limits: ContractLimits): Plan {
    const plan = new TopStep().plans[0];
    if (!plan) throw new Error('No TopStep plan registered');
    return plan.withOverrides({ contractLimits: limits });
}

function runFundedDays(options: {
    days: number;
    limits: ContractLimits;
    startingProfit: number;
    winrate: number;
}): number {
    const plan = fundedTieredPlan(options.limits);
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance += options.startingProfit;
    const stats = freshStats(state.startingBalance);
    const rng = scriptedRng(
        Array.from({ length: options.days * TRADES_PER_DAY }, () =>
            options.winrate > 0 ? 0.01 : 0.99,
        ),
    );
    for (let day = 0; day < options.days; day++) {
        runDay({
            commission: dollars(0),
            dayPolicy: {
                ladder: Array.from({ length: TRADES_PER_DAY }, () => RUNG_RISK),
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            },
            phase: TradingPhase.Funded,
            plan,
            positionSizing: NQ,
            rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(options.winrate),
        });
    }
    return state.balance - state.startingBalance;
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

    it('caps risk to $0 when the contract limit is exactly zero, unlike an unconfigured (null) limit', () => {
        expect(capRiskToContractLimit(500, NQ, contracts(0))).toBe(0);
    });

    it('caps risk to $0 when the contract limit is negative', () => {
        expect(capRiskToContractLimit(500, NQ, contracts(-1))).toBe(0);
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

    it('RungSizing.SkipIfUnaffordable checks affordability against the contract-limited risk, not the raw ladder rung, so a trade that is genuinely affordable at its real size is not skipped', () => {
        const topstep = new TopStep();
        const plan = topstep.plans[0];
        if (!plan) throw new Error('No TopStep plan registered');

        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = state.balance - 500;
        const stats = freshStats(state.startingBalance);

        runDay({
            commission: dollars(0),
            dayPolicy: {
                ladder: [1000],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            },
            phase: TradingPhase.Funded,
            plan,
            positionSizing: NQ,
            rng: scriptedRng([0.01]),
            rrRatio: 2,
            rungSizing: RungSizing.SkipIfUnaffordable,
            state,
            stats,
            winrate: fraction(1),
        });

        expect(state.balance).toBe(state.startingBalance + 800);
    });
});

describe('resolveContractLimit with a day-start-frozen funded tier (isEffectiveNextSession)', () => {
    it('ignores accountProfitAtSessionStart for a plan that has not opted in, keying the funded tier on live profit exactly as before', () => {
        expect(
            resolveContractLimit(
                LIVE_TIER_LIMITS,
                TradingPhase.Funded,
                false,
                500,
                0,
            ),
        ).toBe(5);
        expect(
            resolveContractLimit(
                LIVE_TIER_LIMITS,
                TradingPhase.Funded,
                false,
                0,
                500,
            ),
        ).toBe(1);
    });

    it('caps an opted-in plan at the day-start tier when live profit has already crossed up into a higher one', () => {
        expect(
            resolveContractLimit(
                FROZEN_TIER_LIMITS,
                TradingPhase.Funded,
                false,
                500,
                0,
            ),
        ).toBe(1);
    });

    it('keeps an opted-in plan on the day-start tier when live profit has fallen out of it, so a losing day does not shrink the cap mid-session', () => {
        expect(
            resolveContractLimit(
                FROZEN_TIER_LIMITS,
                TradingPhase.Funded,
                false,
                0,
                500,
            ),
        ).toBe(5);
    });

    it('falls back to live profit when the fifth argument is omitted, keeping every existing four-argument call site identical', () => {
        expect(
            resolveContractLimit(
                FROZEN_TIER_LIMITS,
                TradingPhase.Funded,
                false,
                500,
            ),
        ).toBe(5);
        expect(
            resolveContractLimit(
                FROZEN_TIER_LIMITS,
                TradingPhase.Funded,
                false,
                0,
            ),
        ).toBe(1);
    });

    it('ignores both profit arguments in the eval phase, which reads its flat cap directly and has no tier to freeze', () => {
        expect(
            resolveContractLimit(
                FROZEN_TIER_LIMITS,
                TradingPhase.Eval,
                false,
                0,
                999_999,
            ),
        ).toBe(7);
        expect(
            resolveContractLimit(
                FROZEN_TIER_LIMITS,
                TradingPhase.Eval,
                true,
                999_999,
                0,
            ),
        ).toBe(70);
    });
});

describe('runDay: an opted-in tiered funded cap is resolved once per calendar day, not once per trade', () => {
    it('sizes both trades of an up-crossing day off the day-start tier ($200 = 1 NQ contract at a 10pt stop, 2 x $400 won), even though the first win already lifts live profit past the $300 tier boundary', () => {
        expect(
            runFundedDays({
                days: 1,
                limits: FROZEN_TIER_LIMITS,
                startingProfit: 0,
                winrate: 1,
            }),
        ).toBe(800);
    });

    it('re-tiers mid-day without the flag, proving the frozen result above is a real behavior change and not the only outcome the fixture allows: the second trade sizes off the 5-contract tier for $1000 risk and a $2000 win', () => {
        expect(
            runFundedDays({
                days: 1,
                limits: LIVE_TIER_LIMITS,
                startingProfit: 0,
                winrate: 1,
            }),
        ).toBe(2400);
    });

    it('holds the higher day-start tier for the whole of a down-crossing day, so both losses are sized at the $1000 5-contract tier the account started the day in', () => {
        expect(
            runFundedDays({
                days: 1,
                limits: FROZEN_TIER_LIMITS,
                startingProfit: 400,
                winrate: 0,
            }),
        ).toBe(-1600);
    });

    it('drops to the 1-contract tier for the second loss without the flag, the mid-day re-tiering this fix removes', () => {
        expect(
            runFundedDays({
                days: 1,
                limits: LIVE_TIER_LIMITS,
                startingProfit: 400,
                winrate: 0,
            }),
        ).toBe(-800);
    });

    it("picks up the previous day's close for the next day's tier, so freezing within a day never freezes the cap across days: day 2 starts at $800 profit and sizes both of its trades off the 5-contract tier ($800 + 2 x $2000)", () => {
        expect(
            runFundedDays({
                days: 2,
                limits: FROZEN_TIER_LIMITS,
                startingProfit: 0,
                winrate: 1,
            }),
        ).toBe(4800);
    });
});
