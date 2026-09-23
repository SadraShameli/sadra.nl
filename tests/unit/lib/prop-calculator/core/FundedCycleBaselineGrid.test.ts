import { describe, expect, it } from 'vitest';

import { FundedCycleBaselineGrid } from '~/lib/prop-calculator/core/FundedCycleBaselineGrid';

function levelsOf(grid: FundedCycleBaselineGrid): number[] {
    return Array.from({ length: grid.size }, (_, index) =>
        grid.dollarsAt(index),
    );
}

describe('FundedCycleBaselineGrid', () => {
    const grid = new FundedCycleBaselineGrid({
        coarseStep: 100,
        fineEnd: 100,
        fineStep: 50,
        max: 500,
        min: 0,
    });

    it('steps finely up to fineEnd, then coarsely until it reaches max', () => {
        expect(levelsOf(grid)).toStrictEqual([0, 50, 100, 200, 300, 400, 500]);
        expect(grid.size).toBe(7);
    });

    it('looks a baseline up at or above its dollar value, clamped to the top level', () => {
        expect(grid.indexAtOrAbove(50)).toBe(1);
        expect(grid.indexAtOrAbove(51)).toBe(2);
        expect(grid.indexAtOrAbove(150)).toBe(3);
        expect(grid.indexAtOrAbove(10_000)).toBe(6);
        expect(grid.indexAtOrAbove(-25)).toBe(0);
        expect(grid.indexAtOrAbove(50 + 1e-12)).toBe(1);
    });

    it('starts at a negative min', () => {
        const negative = new FundedCycleBaselineGrid({
            coarseStep: 100,
            fineEnd: 100,
            fineStep: 100,
            max: 200,
            min: -300,
        });
        expect(levelsOf(negative)).toStrictEqual([
            -300, -200, -100, 0, 100, 200,
        ]);
    });

    it('collapses to one level when min equals max', () => {
        const single = new FundedCycleBaselineGrid({
            coarseStep: 100,
            fineEnd: 100,
            fineStep: 50,
            max: 0,
            min: 0,
        });
        expect(single.size).toBe(1);
        expect(single.indexAtOrAbove(1234)).toBe(0);
        expect(single.dollarsAt(0)).toBe(0);
    });

    it('throws on a non-positive step, a non-finite bound, or min above max', () => {
        const valid = {
            coarseStep: 100,
            fineEnd: 100,
            fineStep: 50,
            max: 500,
            min: 0,
        };
        expect(
            () => new FundedCycleBaselineGrid({ ...valid, fineStep: 0 }),
        ).toThrow(/step/);
        expect(
            () => new FundedCycleBaselineGrid({ ...valid, coarseStep: -1 }),
        ).toThrow(/step/);
        expect(
            () => new FundedCycleBaselineGrid({ ...valid, max: Infinity }),
        ).toThrow(/finite/);
        expect(
            () => new FundedCycleBaselineGrid({ ...valid, max: -1, min: 0 }),
        ).toThrow(/min/);
    });
});
