import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    applyEnginePolicy,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    EngineOptimumRefusalKind,
    EngineOptimumRowKind,
    fundedCycleSeedFromTracker,
    FundedFromStateOptimumResultKind,
    type FundedFromStateSweepRequest,
    runFundedFromStateSweep,
} from '~/lib/prop-calculator/advisor';
import {
    DayStopRuleKind,
    FirmId,
    type FundedCycleSeed,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    resolvePositionSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    buildFundedCandidates,
    FundedCandidateBuildKind,
} from '~/lib/prop-calculator/optimize';
import {
    type FromStateSimInputs,
    type FundedSimStart,
    type SimInputs,
    simulate,
    simulateFromState,
} from '~/lib/prop-calculator/simulator';

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
        trials: 30,
        winrate: 0.4,
        ...overrides,
    };
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

function startAt(
    plan: Plan,
    balanceAbove: number,
    qualifyingDays: number,
    tradingDays: number,
): FundedSimStart {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.balance = state.startingBalance + balanceAbove;
    state.qualifyingDays = qualifyingDays;
    state.tradingDays = tradingDays;
    state.elapsedDays = tradingDays;
    const tracker = newFundedCycleTracker(state);
    const seed: FundedCycleSeed = fundedCycleSeedFromTracker(
        plan,
        state,
        tracker,
    );
    return { phase: TradingPhase.Funded, seed, state };
}

function withCandidateOverrides(
    base: Omit<SimInputs, 'plan'>,
    plan: Plan,
    start: FundedSimStart,
    overrides: Partial<SimInputs>,
): FromStateSimInputs {
    return { ...base, plan, start, ...overrides };
}

describe('runFundedFromStateSweep (PT-32)', () => {
    it('builds candidates via buildFundedCandidates, applies the policy per candidate from the given start and ranks by fromStateExpectedCash', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const base = baseSimInputs();
        const start = startAt(plan, 800, 25, 25);
        const request: FundedFromStateSweepRequest = {
            base,
            candidates: {
                flat: [150, 250, 400],
                fundedLadder: null,
                positionSizing: null,
                stopRule,
            },
            policy,
            source: AdviceSource.FundedSweepFromState,
            start,
        };

        const result = runFundedFromStateSweep(plan, request);
        if (result.kind !== FundedFromStateOptimumResultKind.Optimum) {
            throw new Error('expected an optimum');
        }

        const build = buildFundedCandidates({ ...request.candidates, plan });
        if (build.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected candidates to build');
        }
        const expectedRows = build.candidates.map((candidate) => ({
            candidate,
            out: simulateFromState(
                applyEnginePolicy(
                    plan,
                    policy,
                    withCandidateOverrides(
                        base,
                        plan,
                        start,
                        candidate.overrides,
                    ),
                ) as FromStateSimInputs,
            ),
        }));
        const expectedRanked = expectedRows.toSorted(
            (a, b) => b.out.fromStateExpectedCash - a.out.fromStateExpectedCash,
        );
        const expectedWinner = expectedRanked[0];
        if (!expectedWinner) throw new Error('no expected winner');

        expect(result.optimum.label).toBe(expectedWinner.candidate.label);
        expect(result.optimum.fromStateExpectedCash).toBe(
            expectedWinner.out.fromStateExpectedCash,
        );
        expect(result.optimum.fromStateExpectedRealizedCash).toBe(
            expectedWinner.out.fromStateExpectedRealizedCash,
        );
        expect(
            result.optimum.rows
                .filter((row) => row.kind === EngineOptimumRowKind.Placed)
                .map((row) => row.label),
        ).toStrictEqual(expectedRanked.map((row) => row.candidate.label));
    });

    it('is deterministic per seed: the same request gives the same result', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const start = startAt(plan, 800, 25, 25);
        const request: FundedFromStateSweepRequest = {
            base: baseSimInputs(),
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

        expect(runFundedFromStateSweep(plan, request)).toStrictEqual(
            runFundedFromStateSweep(plan, request),
        );
    });

    it('marks a flat candidate below one contract as a typed refused row, left out of ranking', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const positionSizing = resolvePositionSizing(InstrumentSymbol.MNQ, 10);
        if (positionSizing === null) throw new Error('no MNQ sizing at 10 pts');
        const start = startAt(plan, 800, 25, 25);
        const request: FundedFromStateSweepRequest = {
            base: baseSimInputs({
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 10,
            }),
            candidates: {
                flat: [10, 250],
                fundedLadder: null,
                positionSizing,
                stopRule,
            },
            policy,
            source: AdviceSource.FundedSweepFromState,
            start,
        };

        const result = runFundedFromStateSweep(plan, request);
        if (result.kind !== FundedFromStateOptimumResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        const refused = result.optimum.rows.filter(
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
            result.optimum.rows
                .filter((row) => row.kind === EngineOptimumRowKind.Placed)
                .every((row) => !row.label.startsWith('flat $10')),
        ).toBe(true);
    });

    it('reports a typed refusal with no optimum when buildFundedCandidates refuses the whole build', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const start = startAt(plan, 800, 25, 25);
        const request: FundedFromStateSweepRequest = {
            base: baseSimInputs(),
            candidates: {
                flat: [],
                fundedLadder: null,
                percent: [],
                positionSizing: null,
                stopRule,
            },
            policy,
            source: AdviceSource.FundedSweepFromState,
            start,
        };

        const result = runFundedFromStateSweep(plan, request);
        expect(result.kind).toBe(FundedFromStateOptimumResultKind.NoCandidates);
    });

    it('the request and result round-trip through structuredClone unchanged', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const start = startAt(plan, 800, 25, 25);
        const request: FundedFromStateSweepRequest = {
            base: baseSimInputs(),
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

        expect(structuredClone(request)).toStrictEqual(request);
        const result = runFundedFromStateSweep(plan, request);
        expect(structuredClone(result)).toStrictEqual(result);
    });

    it('near a fresh funded start, ranks two far-apart flat sizes the same way the fresh sweep does', () => {
        const plan = rapidEodPlan();
        const policy = policyFor(plan);
        const base = baseSimInputs({ trials: 400 });
        const start = startAt(plan, 0, 0, 0);
        const candidatesInput = {
            flat: [150, 6000],
            fundedLadder: null,
            positionSizing: null,
            stopRule,
        };
        const request: FundedFromStateSweepRequest = {
            base,
            candidates: candidatesInput,
            policy,
            source: AdviceSource.FundedSweepFromState,
            start,
        };
        const fromStateResult = runFundedFromStateSweep(plan, request);
        if (fromStateResult.kind !== FundedFromStateOptimumResultKind.Optimum) {
            throw new Error('expected an optimum');
        }

        const build = buildFundedCandidates({ ...candidatesInput, plan });
        if (build.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected candidates to build');
        }
        const freshRows = build.candidates.map((candidate) => ({
            candidate,
            out: simulate(
                applyEnginePolicy(plan, policy, {
                    ...base,
                    plan,
                    ...candidate.overrides,
                }),
            ),
        }));
        const freshWinner = freshRows.toSorted(
            (a, b) => b.out.expectedMonthlyNet - a.out.expectedMonthlyNet,
        )[0];
        if (!freshWinner) throw new Error('no fresh winner');

        expect(fromStateResult.optimum.label).toBe(freshWinner.candidate.label);
    });
});
