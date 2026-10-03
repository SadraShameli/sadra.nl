import { describe, expect, it } from 'vitest';

import {
    createInitialState,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    DrawdownKind,
    EodTrailingDrawdown,
    FirmId,
    flatDayPolicy,
    fraction,
    FtmoFuturesVariant,
    ladderFrontier,
    MffuVariant,
    PolicySizing,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    buildLadderGrid,
    canonicaliseGrid,
    enumerateDay,
    type LadderScore,
    type LadderScoreConfig,
    ladderTrialStreams,
    runLadderSearch,
    scoreLadder,
} from '~/lib/prop-calculator/core/LadderSearch';
import { findFirm } from '~/lib/prop-calculator/firms';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    simulate,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { memoise } from '../../memoise';

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

const firm = new MyFundedFutures();

function config(): LadderScoreConfig {
    return {
        commission: 0,
        cushion: 2000,
        maxDays: 150,
        plan: rapidEod(),
        positionSizing: null,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seedOffset: 0,
        sims: 20_000,
        stopRule: { kind: DayStopRuleKind.DayGreen },
        winrate: 0.4,
    };
}

function eodDayStart(cushion: number) {
    return {
        commission: 0,
        contractLimit: null,
        dayStart: createInitialState(50_000, 50_000 - cushion),
        drawdown: new EodTrailingDrawdown({ amount: dollars(2000) }),
        positionSizing: null,
    };
}

function rapidEod() {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('Rapid EOD 50K plan missing');
    return plan;
}

describe('MFF Rapid EOD 50K plan parameters', () => {
    it('matches the validated help-centre rule set', () => {
        const plan = rapidEod();
        expect(plan.profitTarget).toBe(3000);
        expect(plan.drawdown.amount).toBe(2000);
        expect(plan.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.minTradingDays).toBe(4);
        expect(plan.consistency?.maxBestDayShare).toBe(0.3);
        expect(plan.consistency?.appliesToEval()).toBe(true);
        expect(plan.consistency?.appliesToFunded()).toBe(false);
        expect(plan.evalDailyLossLimit.kind).toBe(DailyLossLimitKind.None);
    });
});

describe('enumerateDay', () => {
    it('produces a proper probability distribution', () => {
        const distribution = enumerateDay({
            ...eodDayStart(2000),
            dailyLossLimit: null,
            dayPolicy: {
                ladder: [400, 600, 800, 200],
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule: { kind: DayStopRuleKind.DayGreen },
            },
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: 0.4,
        });
        const total = distribution.outcomes.reduce(
            (sum, outcome) => sum + outcome.probability,
            0,
        );
        expect(total).toBeCloseTo(1, 10);
        expect(distribution.cumulative.at(-1)).toBeCloseTo(1, 10);
    });

    it('reproduces the closed-form blow-up probability for a ladder summing to the cushion', () => {
        for (const ladder of [
            [400, 600, 800, 200],
            [500, 500, 500, 500],
            [100, 300, 600, 1000],
        ]) {
            expect(ladder.reduce((a, b) => a + b, 0)).toBe(2000);
            const distribution = enumerateDay({
                ...eodDayStart(2000),
                dailyLossLimit: null,
                dayPolicy: {
                    ladder,
                    maxLossesPerDay: null,
                    sizing: PolicySizing.ContractCapped,
                    stopRule: { kind: DayStopRuleKind.DayGreen },
                },
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                winrate: 0.4,
            });
            const blown = distribution.outcomes
                .filter((outcome) => outcome.worstPnL <= -2000)
                .reduce((sum, outcome) => sum + outcome.probability, 0);
            expect(blown).toBeCloseTo(0.6 ** 4, 10);
        }
    });

    it('never risks more than the remaining cushion on any path', () => {
        const distribution = enumerateDay({
            ...eodDayStart(2000),
            dailyLossLimit: null,
            dayPolicy: {
                ladder: [400, 600, 900, 1400],
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule: { kind: DayStopRuleKind.DayGreen },
            },
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: 0.4,
        });
        for (const outcome of distribution.outcomes) {
            expect(outcome.worstPnL).toBeGreaterThanOrEqual(-2000);
        }
    });

    it('skips unaffordable rungs entirely under skipIfUnaffordable', () => {
        const capped = enumerateDay({
            ...eodDayStart(1000),
            dailyLossLimit: null,
            dayPolicy: {
                ladder: [400, 900],
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule: { kind: DayStopRuleKind.None },
            },
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: 0.4,
        });
        const skipped = enumerateDay({
            ...eodDayStart(1000),
            dailyLossLimit: null,
            dayPolicy: {
                ladder: [400, 900],
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule: { kind: DayStopRuleKind.None },
            },
            rrRatio: 2,
            rungSizing: RungSizing.SkipIfUnaffordable,
            winrate: 0.4,
        });
        expect(Math.min(...capped.outcomes.map((o) => o.worstPnL))).toBe(-1000);
        expect(Math.min(...skipped.outcomes.map((o) => o.worstPnL))).toBe(-400);
    });

    it('sizes a rung so its loss plus commission stays inside the daily loss limit (N-56)', () => {
        const distribution = enumerateDay({
            ...eodDayStart(2000),
            commission: 5,
            dailyLossLimit: 500,
            dayPolicy: {
                ladder: [1000],
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule: { kind: DayStopRuleKind.None },
            },
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: 0.4,
        });
        expect(
            distribution.outcomes.map((outcome) => outcome.tradePnLs),
        ).toStrictEqual([[985], [-500]]);
    });

    it('subtracts the round-trip commission from every trade', () => {
        const distribution = enumerateDay({
            ...eodDayStart(2000),
            commission: 5,
            dailyLossLimit: null,
            dayPolicy: {
                ladder: [400, 600],
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule: { kind: DayStopRuleKind.None },
            },
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: 0.4,
        });
        expect(
            distribution.outcomes.map((outcome) => outcome.tradePnLs),
        ).toStrictEqual([
            [795, 1195],
            [795, -605],
            [-405, 1195],
            [-405, -605],
        ]);
        expect(
            distribution.outcomes.map((outcome) => outcome.finalPnL),
        ).toStrictEqual([1990, 190, 790, -1010]);
    });
});

describe('scoreLadder charges commission as the simulator does', () => {
    it('matches the simulator eval pass rate at a $40 round trip, below the commission-free rate', () => {
        const ladder = [400, 600, 500];
        const withCommission = scoreLadder(
            ladder,
            { ...config(), commission: 40 },
            ladderTrialStreams(42),
        );
        const withoutCommission = scoreLadder(
            ladder,
            config(),
            ladderTrialStreams(42),
        );
        const sim = simulate({
            commissionPerRoundTrip: 40,
            dayStop: { kind: DayStopRuleKind.DayGreen },
            evalDayPolicy: {
                ladder,
                maxLossesPerDay: null,
                sizing: PolicySizing.ContractCapped,
                stopRule: { kind: DayStopRuleKind.DayGreen },
            },
            fundedHorizonDays: 1,
            maxAttempts: 1,
            maxEvalDays: 150,
            plan: rapidEod(),
            riskPerTrade: 400,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 42,
            tradesPerDay: ladder.length,
            trials: 20_000,
            winrate: 0.4,
        });
        expect(
            Math.abs(withCommission.passRate - sim.evalPassProbability),
        ).toBeLessThan(0.02);
        expect(withCommission.passRate).toBeLessThan(
            withoutCommission.passRate - 0.02,
        );
    });
});

describe('scoreLadder golden values (MFF Rapid EOD 50K, 40% WR, 1:2 R:R)', () => {
    const cases: {
        days: number;
        ladder: number[];
        pass: number;
    }[] = [
        { days: 19.2, ladder: [300, 300, 200, 300], pass: 0.604 },
        { days: 33.7, ladder: [200, 100, 100, 200], pass: 0.759 },
        { days: 64.5, ladder: [100, 100, 100, 100], pass: 0.908 },
        { days: 8.2, ladder: [400, 600, 800, 200], pass: 0.47 },
        { days: 11, ladder: [400, 600, 500], pass: 0.465 },
    ];

    for (const { days, ladder, pass } of cases) {
        it(`scores ${JSON.stringify(ladder)} near ${(pass * 100).toFixed(1)}% / ${days}d`, () => {
            const score = scoreLadder(
                ladder,
                config(),
                ladderTrialStreams(90_210),
            );
            expect(score.passRate).toBeCloseTo(pass, 1);
            expect(score.expectedDaysToFunded).toBeGreaterThan(days * 0.85);
            expect(score.expectedDaysToFunded).toBeLessThan(days * 1.15);
        });
    }

    it('ranks the speed-optimal ladder fastest and the safest ladder highest on pass rate', () => {
        const fast = scoreLadder(
            [400, 600, 800, 200],
            config(),
            ladderTrialStreams(90_210),
        );
        const safe = scoreLadder(
            [100, 100, 100, 100],
            config(),
            ladderTrialStreams(90_210),
        );
        expect(fast.expectedDaysToFunded).toBeLessThan(
            safe.expectedDaysToFunded,
        );
        expect(safe.passRate).toBeGreaterThan(fast.passRate);
        expect(safe.costPerFunded).toBeLessThan(fast.costPerFunded);
    });
});

describe(
    'scoreLadder carries real cushion across days, regression: a fixed ' +
        "per-day cushion assumption (reusing day 1's full $2,000 room on " +
        'every later day regardless of losses already taken) silently ' +
        'overstated pass rate for any ladder whose own sum is well under ' +
        "the plan's cushion, since a losing-but-not-busted day genuinely " +
        'erodes the room available to every later day and a fixed-cushion ' +
        'day-distribution can never see that erosion',
    () => {
        it(
            "scoreLadder's passRate for [400, 600, 500] (sum $1,500, well " +
                "under the $2,000 cushion) matches simulate()'s real, day-to-" +
                'day eval-phase pass rate within Monte Carlo tolerance (scoreLadder ' +
                'never models the funded phase, so it is compared against ' +
                "simulate()'s evalPassProbability, not its fundedSurvivalProbability " +
                'which also gates on surviving the funded horizon), not the ' +
                'inflated ~53% a fixed-$2,000-every-day model reports',
            () => {
                const ladder = [400, 600, 500];
                const plan = rapidEod();

                const score = scoreLadder(
                    ladder,
                    { ...config(), sims: 50_000 },
                    ladderTrialStreams(90_210),
                );

                const out: SimOutputs = simulate({
                    commissionPerRoundTrip: 0,
                    copyAccounts: 1,
                    dayStop: { kind: DayStopRuleKind.DayGreen },
                    discounts: undefined,
                    evalDayPolicy: {
                        ladder,
                        maxLossesPerDay: null,
                        sizing: PolicySizing.ContractCapped,
                        stopRule: { kind: DayStopRuleKind.DayGreen },
                    },
                    fundedHorizonDays: 1,
                    maxAttempts: 1,
                    maxEvalDays: 150,
                    minRetainedCushion: 0,
                    plan,
                    riskPerTrade: 500,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    seed: 42,
                    tradesPerDay: 4,
                    trials: 50_000,
                    winrate: 0.4,
                });

                const evalPassRate = out.evalPassProbability;
                expect(score.passRate).toBeCloseTo(evalPassRate, 1);
                expect(score.passRate).toBeLessThan(0.5);
            },
        );
    },
);

describe('consistency rule is a pass gate, not a failure', () => {
    it('forces a large-best-day account to keep trading past the profit target', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.balance = state.startingBalance + 3000;
        state.bestDayProfit = 3000;
        state.tradingDays = 4;

        expect(plan.isPassed(state)).toBe(false);

        state.balance = state.startingBalance + 10_000;
        expect(plan.isPassed(state)).toBe(true);
    });

    it('requires total profit of bestDay / consistencyPct to pass', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.tradingDays = 4;
        state.bestDayProfit = 1800;

        state.balance = state.startingBalance + 5999;
        expect(plan.isPassed(state)).toBe(false);

        state.balance = state.startingBalance + 6000;
        expect(plan.isPassed(state)).toBe(true);
    });

    it('does not gate a plan whose consistency rule is funded-scope only', () => {
        const builder = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Builder,
        });
        if (!builder) throw new Error('Builder plan missing');
        expect(builder.consistency?.appliesToEval()).toBe(false);

        const state = builder.initialState();
        state.balance = state.startingBalance + builder.profitTarget;
        state.bestDayProfit = builder.profitTarget;
        state.tradingDays = builder.minTradingDays;
        expect(builder.isPassed(state)).toBe(true);
    });
});

describe('cushion cap invariant', () => {
    it('never lets a single trade lose more than the cushion available before it', () => {
        const plan = rapidEod();
        const rng = mulberry32(4242);
        for (let trial = 0; trial < 2000; trial++) {
            const state = plan.initialState();
            const stats = freshStats(state.startingBalance);
            const floorBefore = state.threshold;
            runDay({
                commission: dollars(0),
                dayPolicy: {
                    ladder: [400, 600, 900, 1400],
                    maxLossesPerDay: null,
                    sizing: PolicySizing.ContractCapped,
                    stopRule: { kind: DayStopRuleKind.DayGreen },
                },
                phase: TradingPhase.Eval,
                plan,
                positionSizing: null,
                rng,
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                state,
                stats,
                winrate: fraction(0.4),
            });
            expect(state.balance).toBeGreaterThanOrEqual(floorBefore);
        }
    });

    it('caps an oversized rung to the cushion instead of over-risking', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        const stats = freshStats(state.startingBalance);
        runDay({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(
                999_999,
                1,
                {
                    kind: DayStopRuleKind.None,
                },
                PolicySizing.ContractCapped,
            ),
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rng: () => 0.99,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        });
        expect(state.balance).toBe(state.startingBalance - 2000);
    });
});

describe('grid search bounding', () => {
    it('enumerates ladders with the no-gap constraint', () => {
        const grid = buildLadderGrid({
            lo: 100,
            max: 200,
            slots: 2,
            step: 100,
        });
        const keys = grid.map((l) => l.join(','));
        expect(keys).toContain('100');
        expect(keys).toContain('100,200');
        expect(keys).not.toContain('0,100');
    });

    it('de-duplicates ladders only when a rung is genuinely unreachable (a literal <=0 rung), not by a cushion-based worst-case guess', () => {
        const trailingZeroAliases = [
            [400, 600, 0, 900],
            [400, 600, 0, 500],
        ];
        const canonical = canonicaliseGrid(trailingZeroAliases);
        expect(canonical).toHaveLength(1);
        expect(canonical[0]).toEqual([400, 600]);
    });

    it('does not alias ladders whose later rungs merely exceed a cushion-based worst-case running total, since actual per-day cushion grows after a win and those rungs can genuinely fire', () => {
        const distinct = [
            [400, 600, 1800, 100],
            [400, 600, 1400, 0],
            [400, 600, 2000, 900],
        ];
        const canonical = canonicaliseGrid(distinct);
        expect(canonical).toHaveLength(3);
        expect(canonical).toContainEqual([400, 600, 1800, 100]);
        expect(canonical).toContainEqual([400, 600, 1400]);
        expect(canonical).toContainEqual([400, 600, 2000, 900]);
    });
});

function score(overrides: Partial<LadderScore>): LadderScore {
    return {
        costPerFunded: 0,
        costPerFundedStandardError: 0,
        expectedDaysToFunded: 0,
        expectedDaysToFundedStandardError: 0,
        ladder: [],
        meanDaysOnFail: 0,
        meanDaysOnPass: 0,
        passRate: 1,
        passRateStandardError: 0,
        ...overrides,
    };
}

describe('ladderFrontier', () => {
    it('excludes a dominated ladder (same days, higher cost) even when it ties on expectedDaysToFunded and appears earlier in the input', () => {
        const dominated = score({
            costPerFunded: 500,
            expectedDaysToFunded: 10,
            ladder: [100],
        });
        const dominant = score({
            costPerFunded: 400,
            expectedDaysToFunded: 10,
            ladder: [200],
        });
        expect(ladderFrontier([dominated, dominant])).toEqual([dominant]);
        expect(ladderFrontier([dominant, dominated])).toEqual([dominant]);
    });
});

describe('runLadderSearch', () => {
    it('rediscovers the documented speed-optimal ladder prefix from a $200-step grid of 340 ladders (the $100-step grid of 4,680 ladders at 20,000 sims took 400 s; this grid scores 1,000 sims a ladder)', () => {
        const result = runLadderSearch({
            grid: { lo: 200, max: 800, slots: 4, step: 200 },
            score: { ...config(), sims: 1000 },
            seed: 90_210,
            topN: 5,
        });

        const winner = result.bySpeed[0];
        if (!winner) throw new Error('no speed winner');
        expect(result.gridSize).toBe(340);
        expect(winner.ladder.slice(0, 3)).toEqual([400, 600, 800]);
        expect(winner.expectedDaysToFunded).toBeGreaterThan(8);
        expect(winner.expectedDaysToFunded).toBeLessThan(9);
        expect(new Set(result.byCost[0]?.ladder)).toEqual(new Set([200]));
    });

    it('reports zero dropped aliases for a grid-search grid, since buildLadderGrid never emits a raw ladder with a literal <=0 rung (aliasing only ever collapses that exact case)', () => {
        const result = runLadderSearch({
            grid: { lo: 200, max: 800, slots: 4, step: 200 },
            score: { ...config(), sims: 100 },
            seed: 90_210,
        });
        expect(result.gridSize).toBe(result.laddersScored);
        expect(result.droppedAliasCount).toBe(0);
    });

    it('returns a frontier that is strictly improving on both axes', () => {
        const result = runLadderSearch({
            grid: { lo: 200, max: 600, slots: 3, step: 200 },
            score: { ...config(), sims: 1000 },
            seed: 90_210,
        });
        expect(result.frontier.length).toBeGreaterThan(1);
        for (let index = 1; index < result.frontier.length; index++) {
            const previous = result.frontier[index - 1];
            const current = result.frontier[index];
            if (!previous || !current) throw new Error('frontier gap');
            expect(current.expectedDaysToFunded).toBeGreaterThanOrEqual(
                previous.expectedDaysToFunded,
            );
            expect(current.costPerFunded).toBeLessThan(previous.costPerFunded);
        }
    });

    it('scores each distinct ladder exactly once', () => {
        const result = runLadderSearch({
            grid: { lo: 300, max: 300, slots: 2, step: 100 },
            score: { ...config(), sims: 3000 },
            seed: 90_210,
        });
        const identical = result.bySpeed.filter(
            (s) => s.ladder.join(',') === '300,300',
        );
        expect(identical).toHaveLength(1);
    });
});

const aggressiveLadder = {
    ladder: [400, 600, 800, 200],
    maxLossesPerDay: null,
    sizing: PolicySizing.ContractCapped,
    stopRule: { kind: DayStopRuleKind.DayGreen as const },
};

function condFundedBust(out: SimOutputs): number {
    const reachedFunded = out.evalPassProbability;
    return out.fundedBustProbability / reachedFunded;
}

function runPhaseSim(overrides: Partial<Parameters<typeof simulate>[0]>) {
    return simulate({
        fundedHorizonDays: 60,
        maxEvalDays: 60,
        minRetainedCushion: 2000,
        plan: rapidEod(),
        riskPerTrade: 250,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 4000,
        winrate: 0.4,
        ...overrides,
    });
}

const phaseRuns = {
    bothPhases: memoise(() =>
        runPhaseSim({
            evalDayPolicy: aggressiveLadder,
            fundedDayPolicy: aggressiveLadder,
        }),
    ),
    evalLadder: memoise(() => runPhaseSim({ evalDayPolicy: aggressiveLadder })),
    flat: memoise(() => runPhaseSim({})),
};

describe('eval and funded day policies are independent', () => {
    it('leaves the funded phase on flat risk when only an eval ladder is set', () => {
        expect(condFundedBust(phaseRuns.evalLadder())).toBeCloseTo(
            condFundedBust(phaseRuns.flat()),
            2,
        );
    });

    it('does not collapse the pass rate the way a funded-phase ladder does', () => {
        const evalOnly = phaseRuns.evalLadder();
        const bothPhases = phaseRuns.bothPhases();

        expect(condFundedBust(bothPhases)).toBeGreaterThan(
            condFundedBust(evalOnly) + 0.2,
        );
        expect(evalOnly.fundedSurvivalProbability).toBeGreaterThan(
            bothPhases.fundedSurvivalProbability * 10,
        );
    });

    it('changes the eval phase without touching funded risk', () => {
        expect(phaseRuns.evalLadder().daysToPassP50).not.toBe(
            phaseRuns.flat().daysToPassP50,
        );
    });
});

describe('scoreLadder honours a terminating daily loss limit', () => {
    const softPlan = rapidEod().withOverrides({
        evalDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
    });
    const hardPlan = softPlan.withOverrides({
        evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
    });
    const score = (plan: typeof softPlan, ladder: readonly number[]) =>
        scoreLadder(
            ladder,
            { ...config(), plan, stopRule: { kind: DayStopRuleKind.None } },
            ladderTrialStreams(90_210),
        );

    it(
        'a ladder whose rungs sum past the limit scores strictly worse under a ' +
            'hard limit than under an identical soft one, because reaching the ' +
            'limit ends the account instead of ending the day, without this the ' +
            'ladder optimizer would keep recommending account-killing ladders ' +
            'that the simulator on the same screen reports as fatal',
        () => {
            const overLadder = [400, 400, 400];
            const soft = score(softPlan, overLadder);
            const hard = score(hardPlan, overLadder);
            expect(soft.passRate).toBeGreaterThan(0);
            expect(hard.passRate).toBeLessThan(soft.passRate);
        },
    );

    it(
        'a ladder that can never reach the limit scores identically under both, ' +
            'so the new bust path is inert unless the trader actually risks into it',
        () => {
            const underLadder = [200, 200, 200];
            expect(score(hardPlan, underLadder).passRate).toBe(
                score(softPlan, underLadder).passRate,
            );
        },
    );
});

describe('scoreLadder folds the monthly subscription into costPerFunded', () => {
    it(
        'is nonzero for a subscription-priced plan with $0 activation and ' +
            "$0 one-time eval fee, using each ladder's own mean days-to-pass " +
            'to size the number of subscription months charged',
        () => {
            const firmObject = findFirm(FirmId.FtmoFutures);
            if (!firmObject)
                throw new Error('FTMO Futures firm not registered');
            const plan = firmObject.findPlan({
                accountSize: 50_000,
                firm: FirmId.FtmoFutures,
                variant: FtmoFuturesVariant.Growth,
            });
            if (!plan) throw new Error('FTMO Growth 50K plan not found');
            expect(plan.fees.activation).toBe(0);
            expect(plan.fees.oneTimeEval).toBe(0);
            expect(plan.fees.monthlySubscription).toBeGreaterThan(0);

            const score = scoreLadder(
                [500, 800, 700],
                {
                    commission: 0,
                    cushion: plan.drawdown.amount,
                    maxDays: 150,
                    plan,
                    positionSizing: null,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    seedOffset: 0,
                    sims: 20_000,
                    stopRule: { kind: DayStopRuleKind.DayGreen },
                    winrate: 0.4,
                },
                ladderTrialStreams(90_210),
            );

            expect(score.passRate).toBeGreaterThan(0);
            expect(score.costPerFunded).toBeGreaterThan(0);
            expect(score.costPerFunded).toBeGreaterThanOrEqual(
                plan.fees.monthlySubscription,
            );
        },
    );
});
