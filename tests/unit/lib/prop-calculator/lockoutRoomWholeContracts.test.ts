import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    ApexVariant,
    computedDayPolicy,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    E8FuturesVariant,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    FundedNextVariant,
    InstrumentSymbol,
    LucidVariant,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    PolicySizing,
    resolveFundedTradeRisk,
    resolvePositionSizing,
    RungSizing,
    TopStepVariant,
    TradeifyVariant,
    TradingPhase,
    wholeContractRisk,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    LossStreak,
    newPhaseStats,
    resolveDayPolicy,
    runDay,
    type SimInputs,
    type SimOutputs,
    simulate,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { scriptedRng } from './scriptedRng';

const LOSS_DRAW = 0.99;
const WIN_DRAW = 0.01;
const NQ_STOP_POINTS = 20;
const FLAT_RISK = 800;
const GRANULARITY_TRIALS = 2000;
const MONTHLY_NET_RELATIVE_TOLERANCE = 0.1;
const MONTHLY_NET_ABSOLUTE_TOLERANCE = 50;
const FUNDED_BUST_TOLERANCE = 0.05;
const HALF_CUSHION = fraction(0.5);
const FUNDED_TRADES_PER_DAY = 4;
const DAY_GREEN_STOP = { kind: DayStopRuleKind.DayGreen } as const;
const DAY_GREEN_LADDER = [800, 200, 100, 800] as const;
const ALTERNATING_LADDER = [800, 400, 800, 400] as const;
const INSTANT_FUNDED_LADDER = [FLAT_RISK] as const;

interface LockoutDllCase {
    readonly evalLadder: readonly number[];
    readonly id: PlanId;
}

function expectNqAtOrBelowMnq(nq: SimOutputs, mnq: SimOutputs): void {
    expect(nq.expectedMonthlyNet).toBeLessThanOrEqual(
        mnq.expectedMonthlyNet +
            Math.max(
                MONTHLY_NET_ABSOLUTE_TOLERANCE,
                MONTHLY_NET_RELATIVE_TOLERANCE *
                    Math.abs(mnq.expectedMonthlyNet),
            ),
    );
    expect(nq.fundedBustProbability).toBeGreaterThanOrEqual(
        mnq.fundedBustProbability - FUNDED_BUST_TOLERANCE,
    );
}

function ftmo(variant: FtmoFuturesVariant): Plan {
    return planFor({
        accountSize: 50_000,
        firm: FirmId.FtmoFutures,
        variant,
    });
}

function halfCushionInWholeNqPolicy(): DayPolicy {
    const nq = resolvePositionSizing(InstrumentSymbol.NQ, NQ_STOP_POINTS);
    if (nq === null) throw new Error('NQ sizing did not resolve');
    return computedDayPolicy(
        (state) =>
            wholeContractRisk(
                resolveFundedTradeRisk(
                    state.balance - state.threshold,
                    HALF_CUSHION,
                ),
                nq,
                null,
            ),
        FUNDED_TRADES_PER_DAY,
        DAY_GREEN_STOP,
        PolicySizing.WholeContracts,
    );
}

function pinnedOutputs(out: SimOutputs) {
    return {
        expectedMonthlyNet: out.expectedMonthlyNet,
        expectedPayoutCount: out.expectedPayoutCount,
        fundedBustProbability: out.fundedBustProbability,
    };
}

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error(`plan ${id.firm} not found`);
    return plan;
}

function scriptedFundedDay(plan: Plan, draws: readonly number[]) {
    const positionSizing = resolvePositionSizing(
        InstrumentSymbol.NQ,
        NQ_STOP_POINTS,
    );
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const startingBalance = state.balance;
    const totals = new TradeTotals();
    const stats = newPhaseStats(state.balance, totals, new LossStreak(totals));
    const dayPolicy = resolveDayPolicy(
        {
            commissionPerRoundTrip: 0,
            fundedHorizonDays: 252,
            fundedRiskPerTrade: FLAT_RISK,
            instrument: InstrumentSymbol.NQ,
            maxEvalDays: 1,
            plan,
            riskPerTrade: FLAT_RISK,
            rrRatio: 2,
            seed: 1,
            stopPoints: NQ_STOP_POINTS,
            tradesPerDay: 2,
            trials: 1,
            winrate: 0.4,
        },
        TradingPhase.Funded,
    );
    const result = runDay({
        commission: dollars(0),
        dayPolicy,
        fundedCycle: newFundedCycleTracker(state).cycleSnapshot(plan, state),
        idleDayProbability: 0,
        phase: TradingPhase.Funded,
        plan,
        positionSizing,
        rng: scriptedRng(draws),
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        state,
        stats,
        winrate: fraction(0.4),
    });
    return {
        dayPnL: state.balance - startingBalance,
        result,
        trades: totals.tradesTaken,
    };
}

function stageDInputs(
    plan: Plan,
    evalLadder: readonly number[],
    instrument: InstrumentSymbol,
): SimInputs {
    return {
        commissionPerRoundTrip: 0,
        dayStop: DAY_GREEN_STOP,
        evalDayPolicy: {
            ladder: evalLadder,
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: DAY_GREEN_STOP,
        },
        fundedHorizonDays: 252,
        fundedRiskPerTrade: FLAT_RISK,
        idleDayProbability: 0,
        instrument,
        maxAttempts: 1,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan,
        rebuyLagDays: 0,
        riskPerTrade: evalLadder[0] ?? 0,
        rrRatio: 2,
        seed: 42,
        stopPoints: NQ_STOP_POINTS,
        tradesPerDay: FUNDED_TRADES_PER_DAY,
        trials: GRANULARITY_TRIALS,
        winrate: 0.4,
    };
}

describe('a lockout daily loss room below one whole contract ends the funded day (N-74, U21)', () => {
    it('stops FTMO Growth after one $800 NQ loss: the $200 left under the $1,000 lockout limit cannot fit one $400 NQ, so the would-be win never trades', () => {
        const { dayPnL, result, trades } = scriptedFundedDay(
            ftmo(FtmoFuturesVariant.Growth),
            [LOSS_DRAW, WIN_DRAW],
        );
        expect(trades).toBe(1);
        expect(dayPnL).toBe(-800);
        expect(result.busted).toBe(false);
    });

    it('keeps the T33 placement on FTMO Pro, whose $1,000 limit terminates: the second trade risks the $200 room and a win pays on one $400 NQ', () => {
        expect(
            scriptedFundedDay(ftmo(FtmoFuturesVariant.Pro), [
                LOSS_DRAW,
                WIN_DRAW,
            ]),
        ).toMatchObject({ dayPnL: -800 + 2 * 400, trades: 2 });
    });

    it('busts FTMO Pro when that $200 bust-bound second trade loses', () => {
        const { dayPnL, result, trades } = scriptedFundedDay(
            ftmo(FtmoFuturesVariant.Pro),
            [LOSS_DRAW, LOSS_DRAW],
        );
        expect(trades).toBe(2);
        expect(dayPnL).toBe(-1000);
        expect(result.busted).toBe(true);
    });
});

describe('plans and runs whose room never locks the day are untouched by the lockout room rule (N-74)', () => {
    it('pins TopStep Standard with no DLL at NQ 20 points, flat $800, seed 42', () => {
        const out = simulate(
            stageDInputs(
                planFor({
                    accountSize: 50_000,
                    firm: FirmId.TopStep,
                    variant: TopStepVariant.StandardStandard,
                }),
                [800, 400, 800, 600],
                InstrumentSymbol.NQ,
            ),
        );
        expect(pinnedOutputs(out)).toMatchInlineSnapshot(`
          {
            "expectedMonthlyNet": 2832.5386740331496,
            "expectedPayoutCount": 1.7325,
            "fundedBustProbability": 0.366,
          }
        `);
    });

    it('pins FTMO Pro, whose daily loss limit terminates, at NQ 20 points, flat $800, seed 42', () => {
        const out = simulate(
            stageDInputs(
                ftmo(FtmoFuturesVariant.Pro),
                [800, 200, 200, 800],
                InstrumentSymbol.NQ,
            ),
        );
        expect(pinnedOutputs(out)).toMatchInlineSnapshot(`
          {
            "expectedMonthlyNet": -917.4983366600133,
            "expectedPayoutCount": 0.009,
            "fundedBustProbability": 0.242,
          }
        `);
    });

    it('pins TopStep Standard DLL under skipIfUnaffordable at NQ 20 points, flat $800, seed 7', () => {
        const out = simulate({
            ...stageDInputs(
                planFor({
                    accountSize: 50_000,
                    firm: FirmId.TopStep,
                    variant: TopStepVariant.StandardStandardDll,
                }),
                [800, 200, 100, 800],
                InstrumentSymbol.NQ,
            ),
            rungSizing: RungSizing.SkipIfUnaffordable,
            seed: 7,
        });
        expect(pinnedOutputs(out)).toMatchInlineSnapshot(`
          {
            "expectedMonthlyNet": 771.6161039143657,
            "expectedPayoutCount": 0.4775,
            "fundedBustProbability": 0.366,
          }
        `);
    });
});

const LOCKOUT_DLL_CASES: readonly LockoutDllCase[] = [
    {
        evalLadder: DAY_GREEN_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        },
    },
    {
        evalLadder: ALTERNATING_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Intraday,
        },
    },
    {
        evalLadder: ALTERNATING_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        },
    },
    {
        evalLadder: [500, 800, 700],
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectDaily,
        },
    },
    {
        evalLadder: INSTANT_FUNDED_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Lightning,
        },
    },
    ...[
        LucidVariant.DailyEodDll,
        LucidVariant.DailyIntradayDll,
        LucidVariant.FlexDll,
        LucidVariant.Pro,
    ].map((variant) => ({
        evalLadder: ALTERNATING_LADDER,
        id: { accountSize: 50_000, firm: FirmId.Lucid, variant } as const,
    })),
    {
        evalLadder: INSTANT_FUNDED_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Direct,
        },
    },
    {
        evalLadder: DAY_GREEN_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Builder,
        },
    },
    ...[
        TopStepVariant.StandardStandardDll,
        TopStepVariant.StandardConsistencyDll,
        TopStepVariant.NoFeeStandardDll,
        TopStepVariant.NoFeeConsistencyDll,
    ].map((variant) => ({
        evalLadder: DAY_GREEN_LADDER,
        id: { accountSize: 50_000, firm: FirmId.TopStep, variant } as const,
    })),
    {
        evalLadder: INSTANT_FUNDED_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.ProAccount,
        },
    },
    ...[FundedNextVariant.RapidProDllAddOn, FundedNextVariant.RapidDaily].map(
        (variant) => ({
            evalLadder: DAY_GREEN_LADDER,
            id: {
                accountSize: 50_000,
                firm: FirmId.FundedNext,
                variant,
            } as const,
        }),
    ),
    {
        evalLadder: DAY_GREEN_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Zero,
        },
    },
    {
        evalLadder: ALTERNATING_LADDER,
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        },
    },
    {
        evalLadder: [800, 400, 800, 600],
        id: {
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: E8FuturesVariant.Signature,
        },
    },
    {
        evalLadder: [600, 800, 800, 600],
        id: {
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        },
    },
];

describe('placing a flat $800 in coarser NQ contracts never beats MNQ at the same 20 point stop on a lockout-DLL plan (N-74)', () => {
    it.each(LOCKOUT_DLL_CASES)(
        '$id.firm $id.variant',
        ({ evalLadder, id }) => {
            const plan = planFor(id);
            expectNqAtOrBelowMnq(
                simulate(stageDInputs(plan, evalLadder, InstrumentSymbol.NQ)),
                simulate(stageDInputs(plan, evalLadder, InstrumentSymbol.MNQ)),
            );
        },
        120_000,
    );
});

describe('placing 50% of the cushion in coarser NQ contracts never beats MNQ asked for the same whole-NQ risk at the same 20 point stop on a lockout-DLL plan (N-74)', () => {
    it.each(
        LOCKOUT_DLL_CASES.filter(
            ({ id }) =>
                !(
                    id.firm === FirmId.FundedNext &&
                    id.variant === FundedNextVariant.RapidProDllAddOn
                ),
        ),
    )(
        '$id.firm $id.variant',
        ({ evalLadder, id }) => {
            const plan = planFor(id);
            const base = {
                ...stageDInputs(plan, evalLadder, InstrumentSymbol.NQ),
                fundedRiskPerTrade: undefined,
            };
            expectNqAtOrBelowMnq(
                simulate({ ...base, fundedCushionPercent: HALF_CUSHION }),
                simulate({
                    ...base,
                    fundedDayPolicy: halfCushionInWholeNqPolicy(),
                    instrument: InstrumentSymbol.MNQ,
                }),
            );
        },
        120_000,
    );
});
