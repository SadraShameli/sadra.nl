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

const T11_DRAWDOWN = 2000;
const T11_MAX = 11_000;

function isNestedBelowMax(
    coarser: FundedCycleBaselineGrid,
    finer: FundedCycleBaselineGrid,
): boolean {
    const finerLevels = levelsOf(finer);
    return levelsOf(coarser)
        .filter((level) => level <= T11_MAX)
        .every((level) => finerLevels.includes(level));
}

function roundedBaseline(grid: FundedCycleBaselineGrid, dollars: number) {
    return grid.dollarsAt(grid.indexAtOrAbove(dollars));
}

function t11Grid(fineRangeMultiple: number, min: number) {
    return new FundedCycleBaselineGrid({
        coarseStep: T11_DRAWDOWN,
        fineEnd: fineRangeMultiple * T11_DRAWDOWN,
        fineStep: T11_DRAWDOWN / 4,
        max: T11_MAX,
        min,
    });
}

describe('FundedCycleBaselineGrid fine range (T11)', () => {
    it.each([0, -1500])(
        'never rounds a baseline higher on a finer grid than on a coarser one, and never below the real baseline (min %s)',
        (min) => {
            const [coarse, landed, exact] = [0, 1, 6].map((multiple) =>
                t11Grid(multiple, min),
            );
            if (!coarse || !landed || !exact) throw new Error('grids missing');
            expect(isNestedBelowMax(coarse, landed)).toBe(true);
            expect(isNestedBelowMax(landed, exact)).toBe(true);
            for (let dollars = min - 100; dollars <= 14_000; dollars += 125) {
                const exactBaseline = roundedBaseline(exact, dollars);
                expect(roundedBaseline(landed, dollars)).toBeGreaterThanOrEqual(
                    exactBaseline,
                );
                expect(roundedBaseline(coarse, dollars)).toBeGreaterThanOrEqual(
                    roundedBaseline(landed, dollars),
                );
                if (dollars <= T11_MAX) {
                    expect(exactBaseline).toBeGreaterThanOrEqual(
                        dollars - 1e-9,
                    );
                }
            }
        },
    );
});
