import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    applyEnginePolicy,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    EngineOptimumRefusalKind,
    EngineOptimumRowKind,
    type EngineOptimumRunnerResult,
    fundedCycleSeedFromTracker,
    type FundedFromStateSweepRequest,
    FundedSweepOptimumResultKind,
    type LadderSearchRequestSource,
    type NextPayoutProjectionRequest,
    type PayoutSizeSweepRequest,
    runEngineOptimum,
    runFundedFromStateSweep,
    runNextPayoutProjection,
    runPayoutSizeSweep,
} from '~/lib/prop-calculator/advisor';
import {
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { runLadderSearch } from '~/lib/prop-calculator/core/LadderSearch';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    buildFundedCandidates,
    FundedCandidateBuildKind,
    FundedSortKey,
    sortFundedResults,
    survivorCount,
} from '~/lib/prop-calculator/optimize';
import {
    type FundedSimStart,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator/simulator';

const LADDER_SOURCES: readonly LadderSearchRequestSource[] = [
    AdviceSource.LadderSearchFresh,
    AdviceSource.LadderSearchFromState,
];

const stopRule = { kind: DayStopRuleKind.DayGreen } as const;

function baseSimInputs(
    overrides: Partial<Omit<SimInputs, 'plan'>> = {},
): Omit<SimInputs, 'plan'> {
    return {
        fundedHorizonDays: 90,
        maxEvalDays: 40,
        payoutRequestSize: 2500,
        rebuyLagDays: 0,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 20,
        winrate: 0.4,
        ...overrides,
    };
}

function mnqAtTen(): PositionSizingConfig {
    const sizing = resolvePositionSizing(InstrumentSymbol.MNQ, 10);
    if (sizing === null) throw new Error('no MNQ position sizing at 10 points');
    return sizing;
}

function policyFor(plan: Plan) {
    return buildEnginePolicy({
        fundedHorizonDays: 90,
        plan,
        rulebook: DEFAULT_RULEBOOK,
    }).policy;
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

function withCandidateOverrides(
    base: Omit<SimInputs, 'plan'>,
    plan: Plan,
    overrides: Partial<SimInputs>,
): SimInputs {
    return { ...base, plan, ...overrides };
}

describe('runEngineOptimum (PT-19 step 7)', () => {
    describe('ladder sources', () => {
        it.each(LADDER_SOURCES)(
            'dispatches %s to runLadderSearch with the plan reattached, position and rung sizing intact',
            (source) => {
                const plan = rapidEodPlan();
                const request = {
                    grid: { lo: 100, max: 300, slots: 2, step: 100 },
                    score: {
                        commission: 0,
                        cushion: 2000,
                        maxDays: 40,
                        positionSizing: null,
                        rrRatio: 2,
                        rungSizing: RungSizing.CapToCushion,
                        seedOffset: 0,
                        sims: 200,
                        stopRule,
                        winrate: 0.4,
                    },
                    seed: 90_210,
                    source,
                    topN: 3,
                } as const;

                const result = runEngineOptimum(plan, request);
                if (!('ladder' in result))
                    throw new Error('expected a ladder result');
                const expected = runLadderSearch({
                    grid: request.grid,
                    score: { ...request.score, plan },
                    seed: request.seed,
                    topN: request.topN,
                });

                expect(result.ladder).toStrictEqual(expected);
                expect(result.source).toBe(source);
            },
        );

        it('is deterministic per seed: the same request gives the same result', () => {
            const plan = rapidEodPlan();
            const request = {
                grid: { lo: 100, max: 300, slots: 2, step: 100 },
                score: {
                    commission: 0,
                    cushion: 2000,
                    maxDays: 40,
                    positionSizing: null,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    seedOffset: 0,
                    sims: 200,
                    stopRule,
                    winrate: 0.4,
                },
                seed: 90_210,
                source: AdviceSource.LadderSearchFresh,
                topN: 3,
            } as const;

            const first = runEngineOptimum(plan, request);
            const second = runEngineOptimum(plan, request);
            expect(first).toStrictEqual(second);
        });

        it('carries position and rung sizing into runLadderSearch', () => {
            const plan = rapidEodPlan();
            const positionSizing = mnqAtTen();
            const request = {
                grid: { lo: 100, max: 300, slots: 2, step: 100 },
                score: {
                    commission: 0,
                    cushion: 2000,
                    maxDays: 40,
                    positionSizing,
                    rrRatio: 2,
                    rungSizing: RungSizing.SkipIfUnaffordable,
                    seedOffset: 0,
                    sims: 200,
                    stopRule,
                    winrate: 0.4,
                },
                seed: 90_210,
                source: AdviceSource.LadderSearchFresh,
            } as const;

            const result = runEngineOptimum(plan, request);
            if (!('ladder' in result))
                throw new Error('expected a ladder result');
            const expected = runLadderSearch({
                grid: request.grid,
                score: { ...request.score, plan },
                seed: request.seed,
            });
            expect(result.ladder).toStrictEqual(expected);
        });

        it('the request and result round-trip through structuredClone unchanged', () => {
            const plan = rapidEodPlan();
            const request = {
                grid: { lo: 100, max: 300, slots: 2, step: 100 },
                score: {
                    commission: 0,
                    cushion: 2000,
                    maxDays: 40,
                    positionSizing: null,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    seedOffset: 0,
                    sims: 200,
                    stopRule,
                    winrate: 0.4,
                },
                seed: 90_210,
                source: AdviceSource.LadderSearchFresh,
                topN: 3,
            } as const;

            expect(structuredClone(request)).toStrictEqual(request);
            const result = runEngineOptimum(plan, request);
            expect(structuredClone(result)).toStrictEqual(result);
        });
    });

    describe('funded sweep sources', () => {
        it('builds candidates via buildFundedCandidates, applies the policy per candidate and simulates, ranked by sortFundedResults(Monthly)', () => {
            const plan = rapidEodPlan();
            const policy = policyFor(plan);
            const base = baseSimInputs({ trials: 20 });
            const request = {
                base,
                candidates: {
                    flat: [150, 250, 400],
                    fundedLadder: null,
                    positionSizing: null,
                    stopRule,
                },
                policy,
                source: AdviceSource.FundedSweepFresh,
            } as const;

            const result = runEngineOptimum(plan, request);
            if (!('sweep' in result))
                throw new Error('expected a sweep result');
            const { sweep } = result;
            if (sweep.kind !== FundedSweepOptimumResultKind.Optimum) {
                throw new Error(`expected an optimum, got ${sweep.kind}`);
            }

            const build = buildFundedCandidates({
                ...request.candidates,
                plan,
            });
            if (build.kind !== FundedCandidateBuildKind.Built) {
                throw new Error('expected candidates to build');
            }
            const expectedRows = build.candidates.map((candidate) => ({
                candidate,
                out: simulate(
                    applyEnginePolicy(
                        plan,
                        policy,
                        withCandidateOverrides(base, plan, candidate.overrides),
                    ),
                ),
            }));
            const expectedRanked = sortFundedResults(
                expectedRows,
                FundedSortKey.Monthly,
            );
            const expectedWinner = expectedRanked[0];
            if (!expectedWinner) throw new Error('no expected winner');

            expect(sweep.optimum.label).toBe(expectedWinner.candidate.label);
            expect(sweep.optimum.expectedMonthlyNet).toBe(
                expectedWinner.out.expectedMonthlyNet,
            );
            expect(sweep.optimum.expectedMonthlyRealizedNet).toBe(
                expectedWinner.out.expectedMonthlyRealizedNet,
            );
            expect(sweep.optimum.expectedHorizonCredit).toBe(
                expectedWinner.out.expectedHorizonCredit,
            );
            expect(sweep.optimum.survivors).toBe(
                survivorCount(expectedWinner.out, base.trials),
            );
            expect(
                sweep.optimum.rows
                    .filter((row) => row.kind === EngineOptimumRowKind.Placed)
                    .map((row) => row.label),
            ).toStrictEqual(expectedRanked.map((row) => row.candidate.label));
        });

        it('carries the winning candidate standard errors straight off SimOutputs.estimates', () => {
            const plan = rapidEodPlan();
            const policy = policyFor(plan);
            const base = baseSimInputs({ trials: 20 });
            const request = {
                base,
                candidates: {
                    flat: [150, 250],
                    fundedLadder: null,
                    positionSizing: null,
                    stopRule,
                },
                policy,
                source: AdviceSource.FundedSweepFresh,
            } as const;

            const result = runEngineOptimum(plan, request);
            if (!('sweep' in result))
                throw new Error('expected a sweep result');
            if (result.sweep.kind !== FundedSweepOptimumResultKind.Optimum) {
                throw new Error('expected an optimum');
            }

            const build = buildFundedCandidates({
                ...request.candidates,
                plan,
            });
            if (build.kind !== FundedCandidateBuildKind.Built) {
                throw new Error('expected candidates to build');
            }
            const expectedRows = build.candidates.map((candidate) => ({
                candidate,
                out: simulate(
                    applyEnginePolicy(
                        plan,
                        policy,
                        withCandidateOverrides(base, plan, candidate.overrides),
                    ),
                ),
            }));
            const expectedWinner = sortFundedResults(
                expectedRows,
                FundedSortKey.Monthly,
            )[0];
            if (!expectedWinner) throw new Error('no expected winner');

            expect(result.sweep.optimum.expectedMonthlyNetStandardError).toBe(
                expectedWinner.out.estimates.expectedMonthlyNet.standardError,
            );
            expect(
                result.sweep.optimum.expectedMonthlyRealizedNetStandardError,
            ).toBe(
                expectedWinner.out.estimates.expectedMonthlyRealizedNet
                    .standardError,
            );
            expect(
                result.sweep.optimum.expectedHorizonCreditStandardError,
            ).toBe(
                expectedWinner.out.estimates.expectedHorizonCredit
                    .standardError,
            );
            expect(
                result.sweep.optimum.expectedMonthlyNetStandardError,
            ).not.toBeNull();
            expect(
                result.sweep.optimum.expectedMonthlyRealizedNetStandardError,
            ).not.toBeNull();
            expect(
                result.sweep.optimum.expectedHorizonCreditStandardError,
            ).not.toBeNull();
        });

        it('is deterministic per seed: the same request gives the same result', () => {
            const plan = rapidEodPlan();
            const policy = policyFor(plan);
            const base = baseSimInputs({ trials: 20 });
            const request = {
                base,
                candidates: {
                    flat: [150, 250],
                    fundedLadder: null,
                    positionSizing: null,
                    stopRule,
                },
                policy,
                source: AdviceSource.FundedSweepFresh,
            } as const;

            const first = runEngineOptimum(plan, request);
            const second = runEngineOptimum(plan, request);
            expect(first).toStrictEqual(second);
        });

        it('marks a flat candidate below one contract as a typed refused row, left out of ranking', () => {
            const plan = rapidEodPlan();
            const policy = policyFor(plan);
            const positionSizing = mnqAtTen();
            const base = baseSimInputs({
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 10,
                trials: 20,
            });
            const request = {
                base,
                candidates: {
                    flat: [10, 250],
                    fundedLadder: null,
                    positionSizing,
                    stopRule,
                },
                policy,
                source: AdviceSource.FundedSweepFresh,
            } as const;

            const result = runEngineOptimum(plan, request);
            if (!('sweep' in result))
                throw new Error('expected a sweep result');
            if (result.sweep.kind !== FundedSweepOptimumResultKind.Optimum) {
                throw new Error('expected an optimum');
            }
            const { rows } = result.sweep.optimum;
            const refused = rows.filter(
                (row) => row.kind === EngineOptimumRowKind.Refused,
            );
            expect(refused).toHaveLength(1);
            const [refusedRow] = refused;
            if (!refusedRow) throw new Error('expected a refused row');
            expect(refusedRow.reason).toStrictEqual({
                dollar: 10,
                kind: EngineOptimumRefusalKind.FlatBelowOneContract,
            });
            expect(
                rows
                    .filter((row) => row.kind === EngineOptimumRowKind.Placed)
                    .every((row) => !row.label.startsWith('flat $10')),
            ).toBe(true);
        });

        it('reports a typed refusal with no optimum when buildFundedCandidates refuses the whole build', () => {
            const plan = rapidEodPlan();
            const policy = policyFor(plan);
            const positionSizing = mnqAtTen();
            const base = baseSimInputs({
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 10,
                trials: 20,
            });
            const request = {
                base,
                candidates: {
                    flat: [5],
                    fundedLadder: null,
                    percent: [],
                    positionSizing,
                    stopRule,
                },
                policy,
                source: AdviceSource.FundedSweepFresh,
            } as const;

            const build = buildFundedCandidates({
                ...request.candidates,
                plan,
            });
            expect(build.kind).toBe(FundedCandidateBuildKind.Refused);

            const result = runEngineOptimum(plan, request);
            if (!('sweep' in result))
                throw new Error('expected a sweep result');
            expect(result.sweep.kind).toBe(
                FundedSweepOptimumResultKind.NoCandidates,
            );
            if (
                result.sweep.kind !== FundedSweepOptimumResultKind.NoCandidates
            ) {
                throw new Error('expected NoCandidates');
            }
            expect(result.sweep.refusal).toStrictEqual(
                build.kind === FundedCandidateBuildKind.Refused
                    ? build.refusal
                    : undefined,
            );
        });

        it('the request and result round-trip through structuredClone unchanged', () => {
            const plan = rapidEodPlan();
            const policy = policyFor(plan);
            const base = baseSimInputs({ trials: 20 });
            const request = {
                base,
                candidates: {
                    flat: [150, 250],
                    fundedLadder: null,
                    positionSizing: null,
                    stopRule,
                },
                policy,
                source: AdviceSource.FundedSweepFresh,
            } as const;

            expect(structuredClone(request)).toStrictEqual(request);
            const result: EngineOptimumRunnerResult = runEngineOptimum(
                plan,
                request,
            );
            expect(structuredClone(result)).toStrictEqual(result);
        });
    });
});

function fundedSimStartAt(plan: Plan): FundedSimStart {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    return {
        phase: TradingPhase.Funded,
        seed: fundedCycleSeedFromTracker(plan, state, tracker),
        state,
    };
}

describe('runEngineOptimum dispatches PT-32 sources (PT-32 step 6)', () => {
    it('dispatches FundedSweepFromState to runFundedFromStateSweep, matching a direct call', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const start = fundedSimStartAt(plan);
        const request: FundedFromStateSweepRequest = {
            base: baseSimInputs({ trials: 15 }),
            candidates: {
                flat: [150, 250],
                fundedLadder: null,
                positionSizing: null,
                stopRule,
            },
            policy,
            source: AdviceSource.FundedSweepFromState,
            start,
        };

        const result = runEngineOptimum(plan, request);
        if (
            !('sweep' in result) ||
            result.source !== AdviceSource.FundedSweepFromState
        ) {
            throw new Error('expected a from-state sweep result');
        }
        expect(result.sweep).toStrictEqual(
            runFundedFromStateSweep(plan, request),
        );
    });

    it('dispatches PayoutSizeSweep to runPayoutSizeSweep, matching a direct call', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec: {
                enginePolicy: policy,
                rulebook: DEFAULT_RULEBOOK,
                run: { maxEvalDays: 40, seed: 42, trials: 15 },
            },
        };

        const result = runEngineOptimum(plan, request);
        if (
            !('sweep' in result) ||
            result.source !== AdviceSource.PayoutSizeSweep
        ) {
            throw new Error('expected a payout-size sweep result');
        }
        expect(result.sweep).toStrictEqual(runPayoutSizeSweep(plan, request));
    });

    it('dispatches NextPayoutProjection to runNextPayoutProjection, matching a direct call', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const start = fundedSimStartAt(plan);
        const request: NextPayoutProjectionRequest = {
            base: baseSimInputs({ fundedHorizonDays: 10, trials: 15 }),
            policy,
            source: AdviceSource.NextPayoutProjection,
            start,
        };

        const result = runEngineOptimum(plan, request);
        if (!('projection' in result)) {
            throw new Error('expected a projection result');
        }
        expect(result.projection).toStrictEqual(
            runNextPayoutProjection(plan, request),
        );
    });

    it('every PT-32 request and result round-trips through structuredClone unchanged', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const start = fundedSimStartAt(plan);
        const requests: (
            | FundedFromStateSweepRequest
            | NextPayoutProjectionRequest
            | PayoutSizeSweepRequest
        )[] = [
            {
                base: baseSimInputs({ trials: 10 }),
                candidates: {
                    flat: [150],
                    fundedLadder: null,
                    positionSizing: null,
                    stopRule,
                },
                policy,
                source: AdviceSource.FundedSweepFromState,
                start,
            },
            {
                source: AdviceSource.PayoutSizeSweep,
                spec: {
                    enginePolicy: policy,
                    rulebook: DEFAULT_RULEBOOK,
                    run: { maxEvalDays: 40, seed: 42, trials: 10 },
                },
            },
            {
                base: baseSimInputs({ fundedHorizonDays: 10, trials: 10 }),
                policy,
                source: AdviceSource.NextPayoutProjection,
                start,
            },
        ];

        for (const request of requests) {
            expect(structuredClone(request)).toStrictEqual(request);
            const result = runEngineOptimum(plan, request);
            expect(structuredClone(result)).toStrictEqual(result);
        }
    });
});
