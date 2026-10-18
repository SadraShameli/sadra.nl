import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    InstrumentSymbol,
    newFundedCycleTracker,
    type Plan,
    resolvePositionSizing,
    RungSizing,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
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

import {
    expectNqAtOrBelowMnq,
    FLAT_RISK,
    LOCKOUT_DLL_CASES,
    NQ_STOP_POINTS,
    planFor,
    stageDInputs,
} from './lockoutRoomFixtures';
import { scriptedRng } from './scriptedRng';

const LOSS_DRAW = 0.99;
const WIN_DRAW = 0.01;

function ftmo(variant: FtmoFuturesVariant): Plan {
    return planFor({
        accountSize: 50_000,
        firm: FirmId.FtmoFutures,
        variant,
    });
}

function pinnedOutputs(out: SimOutputs) {
    return {
        expectedMonthlyNet: out.expectedMonthlyNet,
        expectedPayoutCount: out.expectedPayoutCount,
        fundedBustProbability: out.fundedBustProbability,
    };
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

function topStepDllPlan(): Plan {
    return planFor({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandardDll,
    });
}

function topStepDllSkipInputs(plan: Plan): SimInputs {
    return {
        ...stageDInputs(plan, [800, 200, 100, 800], InstrumentSymbol.NQ),
        rungSizing: RungSizing.SkipIfUnaffordable,
        seed: 7,
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

    it('pins TopStep Standard DLL under skipIfUnaffordable at NQ 20 points, flat $800, seed 7, with no idle limit in the Combine (WP62b: the net moved from 755.77 only through eval time, see the next test)', () => {
        const out = simulate(topStepDllSkipInputs(topStepDllPlan()));
        expect(pinnedOutputs(out)).toMatchInlineSnapshot(`
          {
            "expectedMonthlyNet": 312.82250222076766,
            "expectedPayoutCount": 0.4775,
            "fundedBustProbability": 0.366,
          }
        `);
    });

    it('reproduces the pre-WP62b 755.77 net when the Combine is given back the 31-session idle limit, with the funded payout count and bust probability identical, so the move is eval-phase time only', () => {
        const out = simulate(
            topStepDllSkipInputs(
                topStepDllPlan().withOverrides({
                    evalMaxConsecutiveIdleDays: 31,
                }),
            ),
        );
        expect(pinnedOutputs(out)).toMatchInlineSnapshot(`
          {
            "expectedMonthlyNet": 755.7682574114245,
            "expectedPayoutCount": 0.4775,
            "fundedBustProbability": 0.366,
          }
        `);
    });
});

describe('placing a flat $800 in coarser NQ contracts never beats MNQ at the same 20 point stop on a lockout-DLL plan (N-74)', () => {
    it.each(LOCKOUT_DLL_CASES)('$id.firm $id.variant', ({ evalLadder, id }) => {
        const plan = planFor(id);
        expectNqAtOrBelowMnq(
            simulate(stageDInputs(plan, evalLadder, InstrumentSymbol.NQ)),
            simulate(stageDInputs(plan, evalLadder, InstrumentSymbol.MNQ)),
        );
    });
});
