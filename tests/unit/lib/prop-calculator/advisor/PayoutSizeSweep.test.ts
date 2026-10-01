import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    fundedCycleSeedFromTracker,
    PAYOUT_SIZE_SWEEP_GRID,
    PAYOUT_SIZE_SWEEP_OBJECTIVE,
    type PayoutSizeSweepRequest,
    PayoutSizeSweepResultKind,
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
        positionSizing?: { instrument: InstrumentSymbol; stopPoints: number };
        seed?: number;
        trials?: number;
    } = {},
): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 90,
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
        const belowMinimum = PAYOUT_SIZE_SWEEP_GRID.filter((size) => size < 1000);
        expect(belowMinimum.length).toBeGreaterThan(0);
        expect(
            result.optimum.rows.some((row) => row.requestSize < 1000),
        ).toBe(false);
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
        const row500 = result.optimum.rows.find((row) => row.requestSize === 500);
        if (!row500) throw new Error('expected the $500 row');
        const expectedOut = simulate(
            toSimInputs(plan, {
                ...spec,
                enginePolicy: { ...spec.enginePolicy, payoutRequestOverride: 500 },
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
        if (winner.kind !== StartBasis.Fresh) throw new Error('expected a fresh winner');
        for (const row of result.optimum.rows) {
            if (row.kind !== StartBasis.Fresh) throw new Error('expected fresh rows');
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
                creditFreeWinner.requestSize !== result.optimum.winner.requestSize,
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

    it('leaves the personal override warning null when the override matches the winner exactly', () => {
        const plan = rapidEodPlan();
        const baseline = runPayoutSizeSweep(plan, {
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan, { trials: 400 }),
        });
        if (baseline.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        const winnerSize = baseline.optimum.winner.requestSize;
        const result = runPayoutSizeSweep(plan, {
            personalOverrideRequest: winnerSize,
            source: AdviceSource.PayoutSizeSweep,
            spec: specFor(plan, { trials: 400 }),
        });
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        expect(result.optimum.personalOverride?.row.requestSize).toBe(
            winnerSize,
        );
        expect(result.optimum.personalOverride?.warning).toBeNull();
    });

    it('warns on a personal override far enough from the winner that no defensible noise band would hide it', () => {
        const plan = rapidEodPlan();
        const highTrialSpec = specFor(plan, { trials: 3000 });
        const baseline = runPayoutSizeSweep(plan, {
            source: AdviceSource.PayoutSizeSweep,
            spec: highTrialSpec,
        });
        if (baseline.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        const winnerSize = baseline.optimum.winner.requestSize;
        const gridExtremes = [
            PAYOUT_SIZE_SWEEP_GRID[0],
            PAYOUT_SIZE_SWEEP_GRID.at(-1),
        ];
        const farthestExtreme = gridExtremes.reduce((farthest, candidate) =>
            candidate !== undefined &&
            (farthest === undefined ||
                Math.abs(candidate - winnerSize) >
                    Math.abs(farthest - winnerSize))
                ? candidate
                : farthest,
        );
        if (farthestExtreme === undefined) {
            throw new Error('expected a grid extreme');
        }

        const result = runPayoutSizeSweep(plan, {
            personalOverrideRequest: farthestExtreme,
            source: AdviceSource.PayoutSizeSweep,
            spec: highTrialSpec,
        });
        if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
            throw new Error('expected an optimum');
        }
        const override = result.optimum.personalOverride;
        if (!override) throw new Error('expected a personal override result');
        const overrideRow = override.row;
        const winner = result.optimum.winner;
        if (
            overrideRow.kind !== StartBasis.Fresh ||
            winner.kind !== StartBasis.Fresh
        ) {
            throw new Error('expected fresh rows');
        }
        expect(overrideRow.requestSize).not.toBe(winner.requestSize);
        expect(override.warning).toStrictEqual({
            optimumBustProbability: winner.out.fundedBustProbability,
            optimumMonthlyNet: winner.out.expectedMonthlyNet,
            overrideBustProbability: overrideRow.out.fundedBustProbability,
            overrideMonthlyNet: overrideRow.out.expectedMonthlyNet,
        });
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
            spec: { ...spec, start: { phase: TradingPhase.Funded, seed, state } },
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
