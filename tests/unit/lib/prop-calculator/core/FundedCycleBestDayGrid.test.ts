import { describe, expect, it } from 'vitest';

import {
    ConsistencyBasis,
    ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
    fraction,
} from '~/lib/prop-calculator/core';
import { FundedCycleBestDayGrid } from '~/lib/prop-calculator/core/FundedCycleBestDayGrid';

const STEP = 25;

function gridOf(requestedBucketCount?: number): FundedCycleBestDayGrid {
    return new FundedCycleBestDayGrid({
        cushionStepDollars: STEP,
        overflowDollars: 4000,
        relevantBestDayDollars: 200,
        requestedBucketCount,
    });
}

describe('FundedCycleBestDayGrid', () => {
    it('covers the relevant best day with buckets one cushion step apart, plus one overflow bucket', () => {
        const grid = gridOf();
        expect(grid.stepDollars).toBe(STEP);
        expect(grid.keyRadix).toBe(11);
        expect(grid.dollarsAt(0)).toBe(0);
        expect(grid.dollarsAt(8)).toBe(200);
    });

    it('rounds a best day up to the next bucket, never down', () => {
        const grid = gridOf();
        expect(grid.indexAtOrAbove(0)).toBe(0);
        expect(grid.indexAtOrAbove(1)).toBe(1);
        expect(grid.indexAtOrAbove(STEP)).toBe(1);
        expect(grid.indexAtOrAbove(STEP + 1)).toBe(2);
        expect(grid.indexAtOrAbove(200)).toBe(8);
    });

    it('keeps a best day just past the relevant range in a real bucket that is rounded up, and sends a day past the last real bucket to the overflow bucket', () => {
        const grid = gridOf();
        expect(grid.indexAtOrAbove(201)).toBe(9);
        expect(grid.indexAtOrAbove(225)).toBe(9);
        expect(grid.indexAtOrAbove(225.01)).toBe(10);
        expect(grid.indexAtOrAbove(1e9)).toBe(10);
    });

    it('reads the overflow bucket back as the overflow dollars, above every real bucket', () => {
        const grid = gridOf();
        expect(grid.dollarsAt(10)).toBe(4000);
        for (let index = 0; index < 10; index++) {
            expect(grid.dollarsAt(index)).toBeLessThan(grid.dollarsAt(10));
        }
    });

    it('raises the overflow dollars above the last real bucket when the caller passes less', () => {
        const grid = new FundedCycleBestDayGrid({
            cushionStepDollars: STEP,
            overflowDollars: 10,
            relevantBestDayDollars: 200,
            requestedBucketCount: undefined,
        });
        expect(grid.dollarsAt(10)).toBeGreaterThan(grid.dollarsAt(9));
    });

    it('counts an over-cap day as a best day the consistency rule denies at every profit the grid can reach, for both boundaries', () => {
        const maxProfit = 5000;
        const share = 0.4;
        const grid = new FundedCycleBestDayGrid({
            cushionStepDollars: STEP,
            overflowDollars: share * maxProfit + STEP,
            relevantBestDayDollars: 200,
            requestedBucketCount: undefined,
        });
        const atOverflow = grid.dollarsAt(grid.indexAtOrAbove(1e6));
        for (const boundary of [
            ConsistencyBoundary.Exclusive,
            ConsistencyBoundary.Inclusive,
        ]) {
            const rule = new ConsistencyRule(
                ConsistencyScope.Funded,
                fraction(share),
                ConsistencyBasis.Cycle,
                ConsistencyViolationEffect.Fail,
                boundary,
                ConsistencyNonPositiveProfit.Violates,
            );
            for (const profit of [0.01, 1, 500, 1999.99, 2000, maxProfit]) {
                expect(rule.isViolated(atOverflow, profit)).toBe(true);
            }
        }
    });

    it('with an explicit bucket count, spreads the buckets so the relevant range is still covered and adds the overflow bucket', () => {
        const grid = gridOf(5);
        expect(grid.keyRadix).toBe(6);
        expect(grid.stepDollars).toBe(3 * STEP);
        expect(grid.dollarsAt(3)).toBe(225);
        expect(grid.indexAtOrAbove(200)).toBe(3);
        expect(grid.indexAtOrAbove(300)).toBe(4);
        expect(grid.indexAtOrAbove(300.01)).toBe(5);
    });

    it('with an explicit bucket count above the exact one, extends the grid past the relevant range at the cushion step', () => {
        const grid = gridOf(40);
        expect(grid.keyRadix).toBe(41);
        expect(grid.stepDollars).toBe(STEP);
        expect(grid.dollarsAt(39)).toBe(975);
        expect(grid.indexAtOrAbove(975)).toBe(39);
        expect(grid.indexAtOrAbove(975.01)).toBe(40);
    });

    it('with an explicit bucket count of 1, tracks no best day at all: one bucket, zero dollars, no overflow', () => {
        const grid = gridOf(1);
        expect(grid.keyRadix).toBe(1);
        expect(grid.dollarsAt(0)).toBe(0);
        expect(grid.indexAtOrAbove(1e9)).toBe(0);
    });

    it('refuses an index outside the grid', () => {
        const grid = gridOf();
        expect(() => grid.dollarsAt(-1)).toThrow(RangeError);
        expect(() => grid.dollarsAt(11)).toThrow(RangeError);
        expect(() => grid.dollarsAt(1.5)).toThrow(RangeError);
    });

    it.each([
        { cushionStepDollars: 0, relevantBestDayDollars: 200 },
        { cushionStepDollars: NaN, relevantBestDayDollars: 200 },
        { cushionStepDollars: STEP, relevantBestDayDollars: NaN },
        {
            cushionStepDollars: STEP,
            relevantBestDayDollars: Infinity,
        },
    ])('refuses a non-positive or non-finite step or range: %o', (options) => {
        expect(
            () =>
                new FundedCycleBestDayGrid({
                    ...options,
                    overflowDollars: 4000,
                    requestedBucketCount: undefined,
                }),
        ).toThrow(/FundedCycleBestDayGrid/);
    });
});
