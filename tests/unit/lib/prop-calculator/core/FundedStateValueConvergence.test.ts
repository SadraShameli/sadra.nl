import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
    sweepToConvergence,
    SweepVerdict,
    ValueIterationMonitor,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const FTMO_GROWTH_COARSE_FIXED_POINT = 60_708.764374278806;
const HORIZON_DAYS = 252;
const PRE_WP17E_FTMO_SWEEPS = 2152;
const TIGHT_TOLERANCE = 1e-7;
const TIGHT_SWEEP_CAP = 200_000;

function perpetualPayoutToyPlan(): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: undefined,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function toyConfig(): FundedStateValueConfig {
    return {
        actionStepMultiple: 0.25,
        cushionStepMultiple: 0.25,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxCushionMultiple: 4,
        meanHorizonDays: HORIZON_DAYS,
        payoutRegimeCap: 0,
        plan: perpetualPayoutToyPlan(),
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.7,
    };
}

describe('computeFundedStateValue converges to its fixed point within the stated tolerance at a 252-day horizon (N-63)', () => {
    it.each([0, 5])(
        'lands within the default tolerance of one dollar of the tightly converged value on a perpetual-payout toy at a day cost of %s',
        (dayCost) => {
            const reference = computeFundedStateValue({
                ...toyConfig(),
                convergenceTolerance: TIGHT_TOLERANCE,
                dayCost,
                maxIterationsPerLevel: TIGHT_SWEEP_CAP,
            });
            const result = computeFundedStateValue({ ...toyConfig(), dayCost });

            expect(reference.unconvergedLevelCount).toBe(0);
            expect(result.unconvergedLevelCount).toBe(0);
            expect(
                Math.abs(result.initialValue - reference.initialValue),
            ).toBeLessThanOrEqual(Math.min(1, result.valueErrorBound));
        },
    );

    it('values FTMO Futures Growth 50K at the coarse probe grid within $1 of the fixed point the solver reaches at tolerance 0.0001 ($60,708.76), in under half the 2,152 sweeps the pre-WP17e default took. Re-derived for T32: the end-of-horizon credit is one capped request, not the whole balance above the floor; with only the pre-T32 credit restored the tolerance 0.0001 run reproduces the old $61,833.38 fixed point exactly, so the credit is the only move', async () => {
        await warmFirmsRegistryCache();
        const plan = ALL_FIRMS.find(
            (firm) => firm.id === FirmId.FtmoFutures,
        )?.findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        });
        if (!plan) throw new Error('FTMO Futures Growth 50K plan not found');

        const result = computeFundedStateValue({
            actionStepMultiple: 0.25,
            cushionStepMultiple: 0.25,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            meanHorizonDays: HORIZON_DAYS,
            payoutRegimeCap: 2,
            plan,
            rrRatio: 2,
            tradesPerDay: 2,
            winrate: 0.5,
        });

        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.reachedStateCount).toBe(81_000);
        expect(
            Math.abs(result.initialValue - FTMO_GROWTH_COARSE_FIXED_POINT),
        ).toBeLessThanOrEqual(Math.min(1, result.valueErrorBound));
        expect(result.sweepCount).toBeLessThan(PRE_WP17E_FTMO_SWEEPS / 2);
    }, 600_000);
});

describe('ValueIterationMonitor states an explicit stopping rule and error bound', () => {
    it('bounds the distance to the fixed point by contraction / (1 - contraction) times the last sweep delta, and stops once that bound is within tolerance', () => {
        const monitor = new ValueIterationMonitor(0.9, 1);

        expect(monitor.record(0.2).verdict).toBe(SweepVerdict.Continue);
        expect(monitor.errorBound).toBeCloseTo(1.8, 12);
        expect(monitor.isConverged).toBe(false);

        expect(monitor.record(0.11).verdict).toBe(SweepVerdict.Converged);
        expect(monitor.errorBound).toBeCloseTo(0.99, 12);
        expect(monitor.isConverged).toBe(true);
    });

    it('keeps the plain "last sweep moved nothing by tolerance or more" rule without a horizon hazard, where no contraction bound exists', () => {
        const monitor = new ValueIterationMonitor(1, 1);

        expect(monitor.record(1).verdict).toBe(SweepVerdict.Continue);
        expect(monitor.errorBound).toBe(Infinity);
        expect(monitor.record(0.999).verdict).toBe(SweepVerdict.Converged);
        expect(monitor.errorBound).toBe(Infinity);
    });

    it('reports a zero bound once a sweep changes nothing', () => {
        const monitor = new ValueIterationMonitor(1, 1);

        expect(monitor.record(0).verdict).toBe(SweepVerdict.Converged);
        expect(monitor.errorBound).toBe(0);
    });

    it('extrapolates a steady geometric tail by ratio / (1 - ratio) once three consecutive sweep ratios agree, which lands exactly on the limit of a single geometric mode', () => {
        const monitor = new ValueIterationMonitor(0.999, 1e-9);
        const ratio = 0.99;
        const deltas = [0, 1, 2, 3].map((sweep) => 100 * ratio ** sweep);

        for (const delta of deltas.slice(0, 3)) {
            expect(monitor.record(delta).verdict).toBe(SweepVerdict.Continue);
        }
        const step = monitor.record(deltas[3] ?? 0);

        expect(step.verdict).toBe(SweepVerdict.Extrapolate);
        expect(step.extrapolationFactor).toBeCloseTo(ratio / (1 - ratio), 9);
        const valueAfterFourSweeps = deltas.reduce(
            (sum, delta) => sum + delta,
            0,
        );
        expect(
            valueAfterFourSweeps + step.extrapolationFactor * (deltas[3] ?? 0),
        ).toBeCloseTo(100 / (1 - ratio), 9);
    });

    it('never extrapolates without a horizon hazard, where the stopping rule has no contraction bound to check a jump against', () => {
        const monitor = new ValueIterationMonitor(1, 1e-9);

        for (let sweep = 0; sweep < 10; sweep++) {
            expect(monitor.record(100 * 0.9 ** sweep).verdict).toBe(
                SweepVerdict.Continue,
            );
        }
    });

    it('does not extrapolate while the sweep ratio is still moving', () => {
        const monitor = new ValueIterationMonitor(0.999, 1e-9);

        for (const delta of [100, 50, 40, 36, 34.5]) {
            expect(monitor.record(delta).verdict).toBe(SweepVerdict.Continue);
        }
    });

    it('demands a steadier ratio after an extrapolation that made the next sweep move more than the sweep before it, and extrapolates again once the ratio is that steady', () => {
        const monitor = new ValueIterationMonitor(0.999, 1e-9);

        for (const delta of [100, 90, 81]) monitor.record(delta);
        expect(monitor.record(72.9).verdict).toBe(SweepVerdict.Extrapolate);

        let delta = 500;
        expect(monitor.record(delta).verdict).toBe(SweepVerdict.Continue);
        for (const ratio of [0.9, 0.903, 0.9, 0.9]) {
            delta *= ratio;
            expect(monitor.record(delta).verdict).toBe(SweepVerdict.Continue);
        }
        expect(monitor.record(delta * 0.9).verdict).toBe(
            SweepVerdict.Extrapolate,
        );
    });

    it('extends its plain-sweep deadline from the first sweep after an extrapolation, so a jump that overshoots by the worst case a contraction allows still converges inside the sweep cap computed from that deadline, where a cap fixed from the first sweep alone runs out', () => {
        const contraction = 0.996;
        const tolerance = 1;
        const minimumSweepCap = 200;
        const monitor = new ValueIterationMonitor(contraction, tolerance);
        const firstDelta = 100;

        for (const delta of [firstDelta, 90, 81]) {
            expect(monitor.record(delta).verdict).toBe(SweepVerdict.Continue);
        }
        const jump = monitor.record(72.9);
        expect(jump.verdict).toBe(SweepVerdict.Extrapolate);
        const deadlineBeforeJump = monitor.plainSweepDeadline;

        let delta =
            (contraction + (1 + contraction) * jump.extrapolationFactor) * 72.9;
        let sweeps = 4;
        let verdict = SweepVerdict.Continue;
        while (sweeps < Math.max(minimumSweepCap, monitor.plainSweepDeadline)) {
            verdict = monitor.record(delta).verdict;
            sweeps++;
            expect(verdict).not.toBe(SweepVerdict.Extrapolate);
            if (verdict === SweepVerdict.Converged) break;
            delta *= sweeps % 2 === 0 ? contraction : contraction - 0.001;
        }

        const contractionFactor = contraction / (1 - contraction);
        const capFromFirstSweepOnly =
            1 +
            Math.ceil(
                Math.log(tolerance / (contractionFactor * firstDelta)) /
                    Math.log(contraction),
            );
        expect(verdict).toBe(SweepVerdict.Converged);
        expect(monitor.isConverged).toBe(true);
        expect(monitor.plainSweepDeadline).toBeGreaterThan(deadlineBeforeJump);
        expect(sweeps).toBeLessThanOrEqual(monitor.plainSweepDeadline);
        expect(sweeps).toBeGreaterThan(capFromFirstSweepOnly);
    });

    it('sets its plain-sweep deadline from the first sweep: the sweep count at which plain contraction alone brings the error bound within tolerance', () => {
        const monitor = new ValueIterationMonitor(0.9, 1);

        expect(monitor.plainSweepDeadline).toBe(0);
        monitor.record(10);

        expect(monitor.plainSweepDeadline).toBe(
            1 + Math.ceil(Math.log(1 / 90) / Math.log(0.9)),
        );
    });

    it('needs only the one sweep as its plain-sweep deadline without a horizon hazard, leaving the flat sweep cap in charge', () => {
        const monitor = new ValueIterationMonitor(1, 1);

        monitor.record(1000);

        expect(monitor.plainSweepDeadline).toBe(1);
    });

    it.each([
        [-0.1, 1],
        [1.1, 1],
        [NaN, 1],
        [0.5, 0],
        [0.5, NaN],
    ])('rejects contraction %s with tolerance %s', (contraction, tolerance) => {
        expect(() => new ValueIterationMonitor(contraction, tolerance)).toThrow(
            RangeError,
        );
    });
});

describe('sweepToConvergence, the per-level loop the funded solver runs, follows the extended plain-sweep deadline (WP17e LOW, WP24)', () => {
    const CONTRACTION = 0.996;
    const TOLERANCE = 1;
    const DEFAULT_SWEEP_CAP = 200;
    const FIRST_DELTA = 100;
    const JUMP_DELTA = 72.9;

    function overshootingLevel(isMaxIterationsExplicit: boolean) {
        const monitor = new ValueIterationMonitor(CONTRACTION, TOLERANCE);
        const scripted = [FIRST_DELTA, 90, 81, JUMP_DELTA];
        const extrapolationFactors: number[] = [];
        let delta = JUMP_DELTA;
        let plainSweeps = 0;
        const sweeps = sweepToConvergence({
            extrapolate: (factor) => {
                extrapolationFactors.push(factor);
                delta = (CONTRACTION + (1 + CONTRACTION) * factor) * JUMP_DELTA;
            },
            isMaxIterationsExplicit,
            maxIterations: DEFAULT_SWEEP_CAP,
            monitor,
            sweep: () => {
                const next = scripted.shift();
                if (next !== undefined) return next;
                const current = delta;
                plainSweeps++;
                delta *=
                    plainSweeps % 2 === 0 ? CONTRACTION : CONTRACTION - 0.001;
                return current;
            },
        });
        return { extrapolationFactors, monitor, sweeps };
    }

    it('keeps sweeping past the cap a first sweep alone would set once a jump overshoots, and converges inside the extended deadline', () => {
        const { extrapolationFactors, monitor, sweeps } =
            overshootingLevel(false);
        const capFromFirstSweepOnly =
            1 +
            Math.ceil(
                Math.log(
                    TOLERANCE /
                        ((CONTRACTION / (1 - CONTRACTION)) * FIRST_DELTA),
                ) / Math.log(CONTRACTION),
            );

        expect(extrapolationFactors).toHaveLength(1);
        expect(monitor.isConverged).toBe(true);
        expect(sweeps).toBeGreaterThan(capFromFirstSweepOnly);
        expect(sweeps).toBeLessThanOrEqual(monitor.plainSweepDeadline);
    });

    it('stops at an explicit sweep cap without converging', () => {
        const { monitor, sweeps } = overshootingLevel(true);

        expect(sweeps).toBe(DEFAULT_SWEEP_CAP);
        expect(monitor.isConverged).toBe(false);
    });
});
