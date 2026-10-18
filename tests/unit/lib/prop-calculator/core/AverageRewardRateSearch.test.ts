import { describe, expect, it } from 'vitest';

import {
    RateSearchStatus,
    searchRateRoot,
} from '~/lib/prop-calculator/core/AverageRewardSolver';

import {
    FAST_GRID_CURVE,
    type RecordedCurve,
    recordedProbe,
    recordedRoot,
    TOP_STEP_DEFAULT_GRID_CURVE,
} from './rateSearchRecordedCurves';

const RATE_TOLERANCE_PER_DAY = 0.05;
const MAX_SOLVES = 12;
const SEED_SHARE_BELOW_ROOT = 0.12;
const NINE_SOLVE_COLD_SEARCH = 9;
const SEEDED_SOLVE_BUDGET = 4;
const CURVES: readonly RecordedCurve[] = [
    TOP_STEP_DEFAULT_GRID_CURVE,
    FAST_GRID_CURVE,
];

function search(
    curve: RecordedCurve,
    startRatePerDay: number,
    isSeeded: boolean,
    scaleErrorBound = 1,
) {
    return searchRateRoot({
        evaluate: (ratePerDay) => {
            const probe = recordedProbe(curve, ratePerDay);
            return { ...probe, errorBound: probe.errorBound * scaleErrorBound };
        },
        isSeeded,
        maxCycleDays: curve.maxCycleDays,
        maxSolves: MAX_SOLVES,
        minCycleDays: curve.minCycleDays,
        startRatePerDay,
        tolerancePerDay: RATE_TOLERANCE_PER_DAY,
    });
}

describe('the rate search on the h(r) curves recorded from the real default-grid runs (WP66a R5)', () => {
    describe.each(CURVES)('$name', (curve) => {
        const root = recordedRoot(curve);

        it('needs fewer than the nine solves the old rule took when it starts cold from rate 0, and ends within the rate tolerance of the root', () => {
            const outcome = search(curve, 0, false);

            expect(outcome.status).toBe(RateSearchStatus.Converged);
            expect(outcome.trace.length).toBeLessThan(NINE_SOLVE_COLD_SEARCH);
            expect(
                Math.abs(outcome.best.ratePerDay - root),
            ).toBeLessThanOrEqual(RATE_TOLERANCE_PER_DAY);
        });

        it(`needs at most ${SEEDED_SOLVE_BUDGET} solves from a seed ${SEED_SHARE_BELOW_ROOT * 100} percent below the root, and ends within the rate tolerance of the root`, () => {
            const seed = root * (1 - SEED_SHARE_BELOW_ROOT);

            const outcome = search(curve, seed, true);

            expect(outcome.status).toBe(RateSearchStatus.Converged);
            expect(outcome.trace.length).toBeLessThanOrEqual(
                SEEDED_SOLVE_BUDGET,
            );
            expect(
                Math.abs(outcome.best.ratePerDay - root),
            ).toBeLessThanOrEqual(RATE_TOLERANCE_PER_DAY);
        });

        it('returns a point whose cycle value is within the error bound of its own solve, so the DP cannot tell it from the root', () => {
            const outcome = search(curve, root * 0.95, true);

            expect(Math.abs(outcome.best.h)).toBeLessThanOrEqual(
                outcome.best.errorBound,
            );
        });

        it('steps from a seed with a slope prior far below the conservative top, so the second rate is past what h over the longest cycle would give and not past the root', () => {
            const seed = root * (1 - SEED_SHARE_BELOW_ROOT);
            const seedProbe = recordedProbe(curve, seed);

            const outcome = search(curve, seed, true);
            const second = outcome.trace[1];

            expect(second?.ratePerDay).toBeGreaterThan(
                seed + seedProbe.h / curve.maxCycleDays,
            );
            expect(second?.ratePerDay).toBeLessThanOrEqual(root);
        });

        it('keeps the conservative first step of h over the longest cycle when the search starts cold, since the slope far from the root is not the slope at it', () => {
            const outcome = search(curve, 0, false);
            const start = recordedProbe(curve, 0);

            expect(outcome.trace[1]?.ratePerDay).toBeCloseTo(
                start.h / curve.maxCycleDays,
                9,
            );
        });

        it('stops after one solve when it starts at the root, since the first cycle value is already inside the error bound', () => {
            const outcome = search(curve, root, true);

            expect(outcome.status).toBe(RateSearchStatus.Converged);
            expect(outcome.trace).toHaveLength(1);
        });

        it('does not stop on the error bound when the solve reports none, and then converges on the rate tolerance alone', () => {
            const outcome = search(curve, root * 0.95, true, 0);

            expect(outcome.status).toBe(RateSearchStatus.Converged);
            expect(Math.abs(outcome.best.h)).toBeLessThan(
                recordedProbe(curve, root * 0.95).h,
            );
            expect(
                Math.abs(outcome.best.ratePerDay - root),
            ).toBeLessThanOrEqual(RATE_TOLERANCE_PER_DAY);
        });

        it('honors the solve cap and reports it', () => {
            const outcome = searchRateRoot({
                evaluate: (ratePerDay) => recordedProbe(curve, ratePerDay),
                isSeeded: false,
                maxCycleDays: curve.maxCycleDays,
                maxSolves: 2,
                minCycleDays: curve.minCycleDays,
                startRatePerDay: 0,
                tolerancePerDay: RATE_TOLERANCE_PER_DAY,
            });

            expect(outcome.status).toBe(RateSearchStatus.SolveCapReached);
            expect(outcome.trace).toHaveLength(2);
        });
    });
});
