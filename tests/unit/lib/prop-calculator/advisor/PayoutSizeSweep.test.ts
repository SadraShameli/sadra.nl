import { beforeAll, describe, expect, it } from 'vitest';

import {
    AdviceSource,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    fundedCycleSeedFromTracker,
    fundedRetainedCushionResolution,
    PAYOUT_SIZE_SWEEP_GRID,
    PAYOUT_SIZE_SWEEP_OBJECTIVE,
    type PayoutSizeSweepRequest,
    type PayoutSizeSweepResult,
    PayoutSizeSweepResultKind,
    type PayoutSizeSweepRow,
    RetainedCushionBasis,
    runPayoutSizeSweep,
    StartBasis,
    toSimInputs,
} from '~/lib/prop-calculator/advisor';
import {
    effectivePayoutRequest,
    FirmId,
    type FundedCycleSeed,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    points,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';
import { NOISE_STANDARD_ERRORS } from '~/lib/prop-calculator/stats';

const PERSONAL_OVERRIDE_TRIALS = 300;
const PERSONAL_OVERRIDE_WARNING_HORIZON_DAYS = 30;

interface FreshBandGaps {
    readonly bustGap: number;
    readonly bustThreshold: number;
    readonly monthlyGap: number;
    readonly monthlyThreshold: number;
}

function bandSpec(plan: Plan): DocumentedPolicySpec {
    return specFor(plan, {
        fundedHorizonDays: PERSONAL_OVERRIDE_WARNING_HORIZON_DAYS,
        trials: PERSONAL_OVERRIDE_TRIALS,
    });
}

function freshBandGaps(
    overrideRow: PayoutSizeSweepRow,
    winner: PayoutSizeSweepRow,
): FreshBandGaps {
    if (
        overrideRow.kind !== StartBasis.Fresh ||
        winner.kind !== StartBasis.Fresh
    ) {
        throw new Error('expected fresh rows');
    }
    return {
        bustGap:
            overrideRow.out.fundedBustProbability -
            winner.out.fundedBustProbability,
        bustThreshold:
            NOISE_STANDARD_ERRORS *
            Math.max(
                overrideRow.out.estimates.fundedBustProbability.standardError,
                winner.out.estimates.fundedBustProbability.standardError,
            ),
        monthlyGap: Math.abs(
            overrideRow.out.expectedMonthlyNet - winner.out.expectedMonthlyNet,
        ),
        monthlyThreshold:
            NOISE_STANDARD_ERRORS *
            Math.max(
                overrideRow.out.estimates.expectedMonthlyNet.standardError,
                winner.out.estimates.expectedMonthlyNet.standardError,
            ),
    };
}

function mffProPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro 50K plan not found');
    return plan;
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

function specFor(
    plan: Plan,
    overrides: {
        fundedHorizonDays?: number;
        positionSizing?: { instrument: InstrumentSymbol; stopPoints: number };
        seed?: number;
        trials?: number;
    } = {},
): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: overrides.fundedHorizonDays ?? 90,
        plan,
        positionSizing:
            overrides.positionSizing === undefined
                ? null
                : {
                      instrument: overrides.positionSizing.instrument,
                      stopPoints: points(overrides.positionSizing.stopPoints),
                  },
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        enginePolicy: policy,
        rulebook: DEFAULT_RULEBOOK,
        run: {
            maxEvalDays: 40,
            seed: overrides.seed ?? 42,
            trials: overrides.trials ?? 30,
        },
    };
}

describe('runPayoutSizeSweep (PT-32)', () => {
    let gridMinimumOverrideResult: null | PayoutSizeSweepResult = null;

    function gridMinimumOverride(): Extract<
        PayoutSizeSweepResult,
        { kind: PayoutSizeSweepResultKind.Optimum }
    > {
        if (
            gridMinimumOverrideResult?.kind !== PayoutSizeSweepResultKind.Optimum
        ) {
            throw new Error('expected an optimum with the grid minimum override');
        }
        return gridMinimumOverrideResult;
    }

    beforeAll(() => {
        const plan = rapidEodPlan();
        gridMinimumOverrideResult = runPayoutSizeSweep(plan, {
            personalOverrideRequest: PAYOUT_SIZE_SWEEP_GRID[0],
            source: AdviceSource.PayoutSizeSweep,
            spec: bandSpec(plan),
        });
    });

    it('dedupes grid sizes below the plan minimum into one row and notes the raise (MFF Pro, $1000 minimum)', () => {
        const plan = mffProPlan();
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan),
        };
        const result = runPayoutSizeSweep(plan, request);
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error(`expected an optimum, got ${result.kind}`);
        }
        const belowMinimum = PAYOUT_SIZE_SWEEP_GRID.filter(
            (size) => size < 1000,
        );
        expect(belowMinimum.length).toBeGreaterThan(0);
        expect(result.optimum.rows.some((row) => row.requestSize < 1000)).toBe(
            false,
        );
        const collapsedRow = result.optimum.rows.find(
            (row) => row.requestSize === 1000,
        );
        if (!collapsedRow) throw new Error('expected the $1000 row');
        expect(collapsedRow.firmMinimumAboveRequest).toStrictEqual({
            minimum: 1000,
            requested: Math.min(...belowMinimum),
        });
        for (const requested of belowMinimum) {
            expect(collapsedRow.requestedSizes).toContain(requested);
        }
    });

    it('builds each row through toSimInputs with only the payout size varied, matching a manual call', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec,
        };
        const result = runPayoutSizeSweep(plan, request);
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error(`expected an optimum, got ${result.kind}`);
        }
        const row500 = result.optimum.rows.find(
            (row) => row.requestSize === 500,
        );
        if (!row500) throw new Error('expected the $500 row');
        const expectedOut = simulate(
            toSimInputs(plan, {
                ...spec,
                enginePolicy: {
                    ...spec.enginePolicy,
                    payoutRequestOverride: 500,
                },
            }),
        );
        expect(row500.out).toStrictEqual(expectedOut);
        expect(row500.kind).toBe(StartBasis.Fresh);
        expect(row500.attemptPaysProbability).toBe(
            expectedOut.attemptPaysProbability,
        );
        expect(row500.anyPayoutGivenFundedProbability).toBe(
            expectedOut.anyPayoutGivenFundedProbability,
        );
    });

    it('picks the winner by the named credit-inclusive objective and reports both monthly figures plus the bust rate', () => {
        const plan = rapidEodPlan();
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan),
        };
        const result = runPayoutSizeSweep(plan, request);
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error(`expected an optimum, got ${result.kind}`);
        }
        expect(result.optimum.objective).toBe(PAYOUT_SIZE_SWEEP_OBJECTIVE);
        const winner = result.optimum.winner;
        if (winner.kind !== StartBasis.Fresh)
            throw new Error('expected a fresh winner');
        for (const row of result.optimum.rows) {
            if (row.kind !== StartBasis.Fresh)
                throw new Error('expected fresh rows');
            expect(row.out.expectedMonthlyNet).toBeLessThanOrEqual(
                winner.out.expectedMonthlyNet,
            );
        }
        expect(winner.out.expectedMonthlyRealizedNet).toBeTypeOf('number');
        expect(winner.out.fundedBustProbability).toBeTypeOf('number');
    });

    it('marks the result credit-sensitive exactly when the credit-inclusive and credit-free winners differ', () => {
        const plan = rapidEodPlan();
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan),
        };
        const result = runPayoutSizeSweep(plan, request);
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error(`expected an optimum, got ${result.kind}`);
        }
        const rows = result.optimum.rows;
        const creditFreeWinner = rows.toSorted((a, b) => {
            const valueOf = (row: typeof a): number =>
                row.kind === StartBasis.Fresh
                    ? row.out.expectedMonthlyRealizedNet
                    : row.out.fromStateExpectedRealizedCash;
            return valueOf(b) - valueOf(a);
        })[0];
        expect(result.optimum.creditSensitive).toBe(
            creditFreeWinner !== undefined &&
                creditFreeWinner.requestSize !==
                    result.optimum.winner.requestSize,
        );
    });

    it('raises a personal override below the plan minimum and never caps it at the grid maximum', () => {
        const plan = mffProPlan();
        const requestBelowMinimum: PayoutSizeSweepRequest = {
            personalOverrideRequest: 200,
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan),
        };
        const resultBelow = runPayoutSizeSweep(plan, requestBelowMinimum);
        if (resultBelow.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        expect(resultBelow.optimum.personalOverride?.row.requestSize).toBe(
            effectivePayoutRequest(plan, 200),
        );

        const requestAboveGrid: PayoutSizeSweepRequest = {
            personalOverrideRequest: 50_000,
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan),
        };
        const resultAbove = runPayoutSizeSweep(plan, requestAboveGrid);
        if (resultAbove.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        expect(resultAbove.optimum.personalOverride?.row.requestSize).toBe(
            50_000,
        );
    });

    it('leaves the personal override warning null for a neighbouring grid size whose monthly gap and bust rate sit inside the 2 standard error band', () => {
        const plan = rapidEodPlan();
        const spec = bandSpec(plan);
        const winnerSize = gridMinimumOverride().optimum.winner.requestSize;
        const neighbourSize = PAYOUT_SIZE_SWEEP_GRID.toSorted(
            (a, b) => b - a,
        ).find((size) => size < winnerSize);
        if (neighbourSize === undefined) {
            throw new Error('expected a grid size below the winner');
        }

        const result = runPayoutSizeSweep(plan, {
            personalOverrideRequest: neighbourSize,
            source: AdviceSource.PayoutSizeSweep,
            spec,
        });
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        const override = result.optimum.personalOverride;
        if (!override) throw new Error('expected a personal override result');
        const gaps = freshBandGaps(override.row, result.optimum.winner);

        expect(override.row.requestSize).toBe(neighbourSize);
        expect(override.row.requestSize).not.toBe(winnerSize);
        expect(gaps.monthlyGap).toBeGreaterThan(0);
        expect(gaps.monthlyGap).toBeLessThanOrEqual(gaps.monthlyThreshold);
        expect(gaps.bustGap).toBeLessThanOrEqual(gaps.bustThreshold);
        expect(override.warning).toBeNull();
    });

    it('warns on a personal override far enough from the winner that no defensible noise band would hide it', () => {
        const highTrialSpec = bandSpec(rapidEodPlan());
        const smallestSize = PAYOUT_SIZE_SWEEP_GRID[0];
        const largestSize = PAYOUT_SIZE_SWEEP_GRID.at(-1);
        if (smallestSize === undefined || largestSize === undefined) {
            throw new Error('expected a grid extreme');
        }

        const { optimum } = gridMinimumOverride();
        expect(
            Math.abs(smallestSize - optimum.winner.requestSize),
        ).toBeGreaterThanOrEqual(
            Math.abs(largestSize - optimum.winner.requestSize),
        );
        const override = optimum.personalOverride;
        if (!override) throw new Error('expected a personal override result');
        const overrideRow = override.row;
        const winner = optimum.winner;
        if (
            overrideRow.kind !== StartBasis.Fresh ||
            winner.kind !== StartBasis.Fresh
        ) {
            throw new Error('expected fresh rows');
        }
        expect(overrideRow.requestSize).not.toBe(winner.requestSize);
        const gaps = freshBandGaps(overrideRow, winner);
        expect(
            gaps.monthlyGap > gaps.monthlyThreshold ||
                gaps.bustGap > gaps.bustThreshold,
        ).toBe(true);
        const documentedCushion =
            fundedRetainedCushionResolution(DEFAULT_RULEBOOK);
        expect(override.warning).toStrictEqual({
            horizonDays: highTrialSpec.enginePolicy.fundedHorizonDays,
            optimumBustProbability: winner.out.fundedBustProbability,
            optimumMonthlyNet: winner.out.expectedMonthlyNet,
            optimumRequestSize: winner.requestSize,
            overrideBustProbability: overrideRow.out.fundedBustProbability,
            overrideMonthlyNet: overrideRow.out.expectedMonthlyNet,
            overrideRequestSize: overrideRow.requestSize,
            retainedCushion: documentedCushion.amount,
            retainedCushionBasis: documentedCushion.basis,
        });
    });

    it('names the personal override as the retained-cushion basis when the policy retains more than the rulebook', () => {
        const plan = rapidEodPlan();
        const personalCushion = 2000;
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            payout: {
                ...DEFAULT_RULEBOOK.payout,
                allowBelowHardRule2: true,
                retainedCushionCents: 50_000,
            },
        };
        const { policy } = buildEnginePolicy({
            fundedHorizonDays: PERSONAL_OVERRIDE_WARNING_HORIZON_DAYS,
            plan,
            positionSizing: null,
            rulebook,
        });
        const spec: DocumentedPolicySpec = {
            enginePolicy: {
                ...policy,
                retainedCushionRequest: personalCushion,
            },
            rulebook,
            run: {
                maxEvalDays: 40,
                seed: 42,
                trials: PERSONAL_OVERRIDE_TRIALS,
            },
        };
        const result = runPayoutSizeSweep(plan, {
            personalOverrideRequest: PAYOUT_SIZE_SWEEP_GRID[0],
            source: AdviceSource.PayoutSizeSweep,
            spec,
        });
        const warnings =
            result.kind === PayoutSizeSweepResultKind.Optimum &&
            result.optimum.personalOverride?.warning
                ? [result.optimum.personalOverride.warning]
                : [];

        expect(warnings.length).toBeGreaterThan(0);
        for (const warning of warnings) {
            expect(warning.retainedCushion).toBe(personalCushion);
            expect(warning.retainedCushionBasis).toBe(
                RetainedCushionBasis.PersonalOverride,
            );
            expect(warning.horizonDays).toBe(
                spec.enginePolicy.fundedHorizonDays,
            );
        }
    });

    it('names the personal override as the retained-cushion basis when the policy retains less than the rulebook (PT-19i review)', () => {
        const plan = rapidEodPlan();
        const retainedCushionCents = 900_000;
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            payout: { ...DEFAULT_RULEBOOK.payout, retainedCushionCents },
        };
        const { policy } = buildEnginePolicy({
            fundedHorizonDays: PERSONAL_OVERRIDE_WARNING_HORIZON_DAYS,
            plan,
            positionSizing: null,
            rulebook,
        });
        const policyCushion = 2000;
        const spec: DocumentedPolicySpec = {
            enginePolicy: {
                ...policy,
                retainedCushionRequest: policyCushion,
            },
            rulebook,
            run: {
                maxEvalDays: 40,
                seed: 42,
                trials: PERSONAL_OVERRIDE_TRIALS,
            },
        };

        const result = runPayoutSizeSweep(plan, {
            personalOverrideRequest: PAYOUT_SIZE_SWEEP_GRID[0],
            source: AdviceSource.PayoutSizeSweep,
            spec,
        });
        const warnings =
            result.kind === PayoutSizeSweepResultKind.Optimum &&
            result.optimum.personalOverride?.warning
                ? [result.optimum.personalOverride.warning]
                : [];

        expect(warnings.length).toBeGreaterThan(0);
        for (const warning of warnings) {
            expect(warning.retainedCushion).toBe(policyCushion);
            expect(warning.retainedCushionBasis).toBe(
                RetainedCushionBasis.PersonalOverride,
            );
        }
    });

    it('propagates a non-refusal error instead of masking it as a no-optimum result', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec: { ...spec, planSerial: 'not-a-real-plan-serial' },
        };
        expect(() => runPayoutSizeSweep(plan, request)).toThrow(
            'the documented policy spec is for plan not-a-real-plan-serial',
        );
    });

    it('reports a typed no-optimum result rather than crashing when every size is refused', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, {
            positionSizing: { instrument: InstrumentSymbol.NQ, stopPoints: 10 },
        });
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec: {
                ...spec,
                rulebook: {
                    ...spec.rulebook,
                    funded: { ...spec.rulebook.funded, riskCents: 1 },
                },
            },
        };
        const result = runPayoutSizeSweep(plan, request);
        expect(result.kind).toBe(PayoutSizeSweepResultKind.NoOptimum);
    });

    it('runs the from-state variant when the spec carries a start, reporting fromStateExpectedCash rows', () => {
        const plan = rapidEodPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.startingBalance + 800;
        state.qualifyingDays = 25;
        state.tradingDays = 25;
        const tracker = newFundedCycleTracker(state);
        const seed: FundedCycleSeed = fundedCycleSeedFromTracker(
            plan,
            state,
            tracker,
        );
        const spec = specFor(plan);
        const request: PayoutSizeSweepRequest = {
            source: AdviceSource.PayoutSizeSweep,
            spec: {
                ...spec,
                start: { phase: TradingPhase.Funded, seed, state },
            },
        };
        const result = runPayoutSizeSweep(plan, request);
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error(`expected an optimum, got ${result.kind}`);
        }
        for (const row of result.optimum.rows) {
            expect(row.kind).toBe(StartBasis.FromState);
            if (row.kind !== StartBasis.FromState) continue;
            expect(row.out.fromStateExpectedCash).toBeTypeOf('number');
        }
    });

    it('the request round-trips through structuredClone unchanged', () => {
        const plan = rapidEodPlan();
        const request: PayoutSizeSweepRequest = {
            personalOverrideRequest: 700,
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan),
        };
        expect(structuredClone(request)).toStrictEqual(request);
    });
});
