import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    applyEnginePolicy,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    EngineOptimumRowKind,
    type EngineOptimumRunnerResult,
    type EnginePolicy,
    fundedCycleSeedFromTracker,
    FundedFromStateOptimumResultKind,
    FundedSweepOptimumResultKind,
    type LadderSearchRequest,
    type NextPayoutProjectionRequest,
    NO_PERSONAL_CAPS,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
import {
    applyPersonalDayLimits,
    type PersonalDayLimits,
} from '~/lib/prop-calculator/advisor/policy';
import {
    DayStopRuleKind,
    type Dollars,
    dollars,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { runLadderSearch } from '~/lib/prop-calculator/core/LadderSearch';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    buildFundedCandidates,
    FundedCandidateBuildKind,
} from '~/lib/prop-calculator/optimize';
import {
    type FundedSimStart,
    type SimInputs,
    simulate,
    simulateFromState,
} from '~/lib/prop-calculator/simulator';

const DAY_GREEN = { kind: DayStopRuleKind.DayGreen } as const;
const RR = 2;

function baseSimInputs(): Omit<SimInputs, 'plan'> {
    return {
        fundedHorizonDays: 60,
        maxEvalDays: 40,
        payoutRequestSize: 2500,
        rebuyLagDays: 0,
        riskPerTrade: 250,
        rrRatio: RR,
        seed: 42,
        tradesPerDay: 4,
        trials: 60,
        winrate: 0.55,
    };
}

function dayGreenHighestPnL(
    ladder: readonly number[],
    index: number,
    dayPnL: number,
): number {
    const rung = ladder[index];
    return rung === undefined || dayPnL > 0
        ? dayPnL
        : Math.max(
              dayPnL,
              dayGreenHighestPnL(ladder, index + 1, dayPnL - rung),
              dayGreenHighestPnL(ladder, index + 1, dayPnL + rung * RR),
          );
}

function evalPassProbabilitiesOf(policy: EnginePolicy): number[] {
    const result = sweepResultOf(policy);
    if (result.sweep.kind !== FundedSweepOptimumResultKind.Optimum) {
        throw new Error('expected an optimum');
    }
    return result.sweep.optimum.rows.flatMap((row) =>
        row.kind === EngineOptimumRowKind.Placed
            ? [row.out.evalPassProbability]
            : [],
    );
}

function fromStateSweepResultOf(
    policy: EnginePolicy,
): Extract<
    EngineOptimumRunnerResult,
    { source: AdviceSource.FundedSweepFromState }
> {
    const plan = rapidEodPlan();
    const result = runEngineOptimum(plan, {
        base: baseSimInputs(),
        candidates: {
            flat: [100, 250, 400],
            fundedLadder: null,
            positionSizing: null,
            stopRule: DAY_GREEN,
        },
        policy,
        source: AdviceSource.FundedSweepFromState,
        start: projectionRequestOf(plan, policy).start,
    });
    if (result.source !== AdviceSource.FundedSweepFromState) {
        throw new Error('expected a from-state funded sweep result');
    }
    return result;
}

function ladderRequestOf(dayLimits?: PersonalDayLimits): LadderSearchRequest {
    return {
        ...(dayLimits !== undefined && { dayLimits }),
        grid: { lo: 100, max: 500, slots: 3, step: 100 },
        score: {
            commission: 0,
            cushion: 2000,
            maxDays: 40,
            positionSizing: null,
            rrRatio: RR,
            rungSizing: RungSizing.CapToCushion,
            seedOffset: 0,
            sims: 60,
            stopRule: DAY_GREEN,
            winrate: 0.4,
        },
        seed: 90_210,
        source: AdviceSource.LadderSearchFresh,
    };
}

function policyWith(
    dailyLossLimit: Dollars | null,
    dailyProfitCap: Dollars | null,
): EnginePolicy {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 60,
        personalCaps: { ...NO_PERSONAL_CAPS, dailyProfitCap },
        personalDll: dailyLossLimit,
        plan: rapidEodPlan(),
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        ...policy,
        personalCaps: { ...NO_PERSONAL_CAPS, dailyProfitCap },
        personalDll: dailyLossLimit,
    };
}

function projectionOf(policy: EnginePolicy) {
    const plan = rapidEodPlan();
    const result = runEngineOptimum(plan, projectionRequestOf(plan, policy));
    if (result.source !== AdviceSource.NextPayoutProjection) {
        throw new Error('expected a next payout projection result');
    }
    return result.projection;
}

function projectionRequestOf(
    plan: Plan,
    policy: EnginePolicy,
): NextPayoutProjectionRequest {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    const start: FundedSimStart = {
        phase: TradingPhase.Funded,
        seed: fundedCycleSeedFromTracker(plan, state, tracker),
        state,
    };
    return {
        base: { ...baseSimInputs(), trials: 150 },
        policy,
        source: AdviceSource.NextPayoutProjection,
        start,
    };
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function scoredLadders(request: LadderSearchRequest) {
    const result = runEngineOptimum(rapidEodPlan(), request);
    if (!('ladder' in result)) throw new Error('expected a ladder result');
    return result.ladder;
}

function sweepResultOf(
    policy: EnginePolicy,
): Extract<
    EngineOptimumRunnerResult,
    { source: AdviceSource.FundedSweepFresh }
> {
    const result = runEngineOptimum(rapidEodPlan(), {
        base: baseSimInputs(),
        candidates: {
            flat: [100, 250, 400],
            fundedLadder: null,
            positionSizing: null,
            stopRule: DAY_GREEN,
        },
        policy,
        source: AdviceSource.FundedSweepFresh,
    });
    if (result.source !== AdviceSource.FundedSweepFresh) {
        throw new Error('expected a fresh funded sweep result');
    }
    return result;
}

describe('the funded sweep runs every candidate through the personal day limits (PT-68h, F-V16)', () => {
    it.each([
        ['a daily loss limit', dollars(300), null],
        ['a daily profit cap', null, dollars(300)],
        ['both limits', dollars(300), dollars(500)],
    ])(
        'simulates each candidate on the limited day with %s',
        (_name, dailyLossLimit, dailyProfitCap) => {
            const plan = rapidEodPlan();
            const policy = policyWith(dailyLossLimit, dailyProfitCap);
            const result = sweepResultOf(policy);
            if (result.sweep.kind !== FundedSweepOptimumResultKind.Optimum) {
                throw new Error('expected an optimum');
            }
            const build = buildFundedCandidates({
                flat: [100, 250, 400],
                fundedLadder: null,
                plan,
                positionSizing: null,
                stopRule: DAY_GREEN,
            });
            if (build.kind !== FundedCandidateBuildKind.Built) {
                throw new Error('expected candidates to build');
            }

            for (const candidate of build.candidates) {
                const engineInputs = applyEnginePolicy(plan, policy, {
                    ...baseSimInputs(),
                    plan,
                    ...candidate.overrides,
                });
                const expected = simulate(
                    applyPersonalDayLimits(policy, engineInputs),
                );
                const row = result.sweep.optimum.rows.find(
                    (placed) =>
                        placed.kind === EngineOptimumRowKind.Placed &&
                        placed.label === candidate.label,
                );
                if (row?.kind !== EngineOptimumRowKind.Placed) {
                    throw new Error(`missing row ${candidate.label}`);
                }
                expect(row.out.expectedMonthlyNet).toBe(
                    expected.expectedMonthlyNet,
                );
            }
        },
    );

    it('changes the figures a limit binds, and not the figures of a plain account', () => {
        const unlimited = sweepResultOf(policyWith(null, null));
        const capped = sweepResultOf(policyWith(null, dollars(100)));
        if (
            unlimited.sweep.kind !== FundedSweepOptimumResultKind.Optimum ||
            capped.sweep.kind !== FundedSweepOptimumResultKind.Optimum
        ) {
            throw new Error('expected optima');
        }

        expect(capped.sweep.optimum.expectedMonthlyNet).not.toBe(
            unlimited.sweep.optimum.expectedMonthlyNet,
        );
        expect(capped.sweep.optimum.expectedMonthlyNet).toBeLessThan(
            unlimited.sweep.optimum.expectedMonthlyNet,
        );
    });
});

describe('the from-state funded sweep runs every candidate through the personal day limits (PT-68h follow-up, F-V16)', () => {
    it.each([
        ['a daily loss limit', dollars(300), null],
        ['a daily profit cap', null, dollars(300)],
        ['both limits', dollars(300), dollars(500)],
    ])(
        'simulates each candidate from the account state on the limited day with %s',
        (_name, dailyLossLimit, dailyProfitCap) => {
            const plan = rapidEodPlan();
            const policy = policyWith(dailyLossLimit, dailyProfitCap);
            const result = fromStateSweepResultOf(policy);
            if (
                result.sweep.kind !== FundedFromStateOptimumResultKind.Optimum
            ) {
                throw new Error('expected an optimum');
            }
            const build = buildFundedCandidates({
                flat: [100, 250, 400],
                fundedLadder: null,
                plan,
                positionSizing: null,
                stopRule: DAY_GREEN,
            });
            if (build.kind !== FundedCandidateBuildKind.Built) {
                throw new Error('expected candidates to build');
            }
            const { start } = projectionRequestOf(plan, policy);

            for (const candidate of build.candidates) {
                const engineInputs = applyEnginePolicy(plan, policy, {
                    ...baseSimInputs(),
                    plan,
                    ...candidate.overrides,
                });
                const expected = simulateFromState({
                    ...applyPersonalDayLimits(policy, engineInputs),
                    start,
                });
                const row = result.sweep.optimum.rows.find(
                    (placed) =>
                        placed.kind === EngineOptimumRowKind.Placed &&
                        placed.label === candidate.label,
                );
                if (row?.kind !== EngineOptimumRowKind.Placed) {
                    throw new Error(`missing row ${candidate.label}`);
                }
                expect(row.out.fromStateExpectedCash).toBe(
                    expected.fromStateExpectedCash,
                );
            }
        },
    );

    it('changes the from-state optimum a limit binds, and keeps a plain account on the very same inputs', () => {
        const unlimited = fromStateSweepResultOf(policyWith(null, null));
        const capped = fromStateSweepResultOf(policyWith(null, dollars(100)));
        if (
            unlimited.sweep.kind !==
                FundedFromStateOptimumResultKind.Optimum ||
            capped.sweep.kind !== FundedFromStateOptimumResultKind.Optimum
        ) {
            throw new Error('expected optima');
        }

        expect(capped.sweep.optimum.fromStateExpectedCash).toBeLessThan(
            unlimited.sweep.optimum.fromStateExpectedCash,
        );
        const plan = rapidEodPlan();
        const plain = policyWith(null, null);
        const inputs = applyEnginePolicy(plan, plain, {
            ...baseSimInputs(),
            plan,
        });
        expect(applyPersonalDayLimits(plain, inputs)).toBe(inputs);
    });
});

describe('the fresh funded sweep applies the personal day limits to its evaluation phase too (PT-68h, F-V16)', () => {
    it('cannot pass a $3,000 target in 40 days under a $50 daily profit cap, where the unlimited sweep passes', () => {
        const unlimited = evalPassProbabilitiesOf(policyWith(null, null));
        const capped = evalPassProbabilitiesOf(policyWith(null, dollars(50)));

        expect(Math.max(...unlimited)).toBeGreaterThan(0.2);
        expect(Math.max(...capped)).toBe(0);
    });
});

describe('the next-payout projection runs on the personal day limits (PT-68h, F-V16)', () => {
    it('takes longer to the first payout under a $100 daily profit cap than without one', () => {
        const unlimited = projectionOf(policyWith(null, null));
        const capped = projectionOf(policyWith(null, dollars(100)));

        expect(unlimited.payingTrials).toBeGreaterThan(0);
        expect(capped.expectedSessionDaysToFirstPayout.value).toBeGreaterThan(
            unlimited.expectedSessionDaysToFirstPayout.value,
        );
    });

    it('is unchanged by a policy with no day limit', () => {
        expect(projectionOf(policyWith(null, null))).toStrictEqual(
            projectionOf(policyWith(null, null)),
        );
    });
});

describe('the eval ladder search scores only ladders the personal day limits allow (PT-68h, F-V16)', () => {
    it('never returns a ladder whose losing rungs add up past the daily loss limit', () => {
        const limited = scoredLadders(
            ladderRequestOf({
                dailyLossLimit: dollars(700),
                dailyProfitCap: null,
            }),
        );
        const unlimited = scoredLadders(ladderRequestOf());

        const returned = [
            ...limited.bySpeed,
            ...limited.byCost,
            ...limited.byPassRate,
            ...limited.frontier,
        ];
        expect(returned.length).toBeGreaterThan(0);
        for (const score of returned) {
            expect(
                score.ladder.reduce((sum, rung) => sum + rung, 0),
            ).toBeLessThanOrEqual(700);
        }
        expect(
            unlimited.bySpeed.some(
                (score) =>
                    score.ladder.reduce((sum, rung) => sum + rung, 0) > 700,
            ) ||
                unlimited.byPassRate.some(
                    (score) =>
                        score.ladder.reduce((sum, rung) => sum + rung, 0) > 700,
                ),
        ).toBe(true);
        expect(limited.gridSize).toBe(unlimited.gridSize);
        expect(limited.laddersScored).toBeLessThan(unlimited.laddersScored);
        expect(limited.droppedAliasCount).toBeGreaterThan(
            unlimited.droppedAliasCount,
        );
    });

    it('never returns a ladder with a rung whose win would pass the daily profit cap', () => {
        const cap = 300;
        const limited = scoredLadders(
            ladderRequestOf({
                dailyLossLimit: null,
                dailyProfitCap: dollars(cap),
            }),
        );

        const returned = [...limited.bySpeed, ...limited.byPassRate];
        expect(returned.length).toBeGreaterThan(0);
        for (const score of returned) {
            let runningLoss = 0;
            for (const rung of score.ladder) {
                expect(rung * RR - runningLoss).toBeLessThanOrEqual(cap + 1e-9);
                runningLoss += rung;
            }
        }
    });

    it('never returns a ladder with a day-green path, partial recoveries included, that passes the daily profit cap', () => {
        const cap = 300;
        const limited = scoredLadders(
            ladderRequestOf({
                dailyLossLimit: null,
                dailyProfitCap: dollars(cap),
            }),
        );
        const returned = [
            ...limited.bySpeed,
            ...limited.byPassRate,
            ...limited.byCost,
            ...limited.frontier,
        ];
        expect(returned.length).toBeGreaterThan(0);
        for (const score of returned) {
            expect(dayGreenHighestPnL(score.ladder, 0, 0)).toBeLessThanOrEqual(
                cap + 1e-9,
            );
        }
    });

    it('scores a plain ladder request exactly as before', () => {
        const request = ladderRequestOf();

        expect(scoredLadders(request)).toStrictEqual(
            runLadderSearch({
                grid: request.grid,
                score: { ...request.score, plan: rapidEodPlan() },
                seed: request.seed,
            }),
        );
    });

    it('ranks a request whose limits bind nothing exactly as the core ladder search does', () => {
        const request = ladderRequestOf({
            dailyLossLimit: dollars(1_000_000),
            dailyProfitCap: dollars(1_000_000),
        });

        expect(scoredLadders(request)).toStrictEqual(
            runLadderSearch({
                grid: request.grid,
                score: { ...request.score, plan: rapidEodPlan() },
                seed: request.seed,
            }),
        );
    });

    it('keeps the grid-too-large refusal for a limited request', () => {
        const result = runEngineOptimum(rapidEodPlan(), {
            ...ladderRequestOf({
                dailyLossLimit: dollars(700),
                dailyProfitCap: null,
            }),
            grid: { lo: 100, max: 800, slots: 4, step: 100 },
            maxGridSize: 10,
        });

        expect('refusal' in result).toBe(true);
    });
});

describe('a day-limited ladder search refuses a stop rule the transform does not describe (PT-68h, F-V16)', () => {
    it.each([
        ['first win', { kind: DayStopRuleKind.FirstWin }],
        ['none', { kind: DayStopRuleKind.None }],
        ['after target', { dollars: 300, kind: DayStopRuleKind.AfterTarget }],
        ['after k losses', { k: 2, kind: DayStopRuleKind.AfterKLosses }],
    ] as const)('throws for the %s stop rule', (_name, stopRule) => {
        const request = ladderRequestOf({
            dailyLossLimit: dollars(700),
            dailyProfitCap: null,
        });

        expect(() =>
            runEngineOptimum(rapidEodPlan(), {
                ...request,
                score: { ...request.score, stopRule },
            }),
        ).toThrow(/day-green/);
    });

    it('still runs a request with no day limit under any stop rule', () => {
        const request = ladderRequestOf();

        expect(() =>
            runEngineOptimum(rapidEodPlan(), {
                ...request,
                score: {
                    ...request.score,
                    stopRule: { kind: DayStopRuleKind.FirstWin },
                },
            }),
        ).not.toThrow();
    });
});
