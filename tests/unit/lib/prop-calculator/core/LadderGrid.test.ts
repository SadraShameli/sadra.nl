import { describe, expect, it } from 'vitest';

import { describeLadderGridFailure } from '~/app/(app)/prop-calculator/_components/useLadderSearch';
import {
    buildLadderGrid,
    defaultLadderGridMax,
    type LadderGridConfig,
    LadderGridError,
    LadderGridFieldError,
    type LadderGridLabels,
    ladderGridSize,
    LadderGridSizeError,
    MAX_LADDER_GRID_SIZE,
    validateLadderGrid,
} from '~/lib/prop-calculator/core';

const valid: LadderGridConfig = { lo: 100, max: 800, slots: 4, step: 100 };

describe('validateLadderGrid rejects grids that can never terminate or make no sense', () => {
    it.each([0, -100, NaN, Infinity])(
        'throws naming step for step %s',
        (step) => {
            expect(() => validateLadderGrid({ ...valid, step })).toThrow(
                /step/,
            );
        },
    );

    it.each([0, -1, 2.5])('throws naming slots for slots %s', (slots) => {
        expect(() => validateLadderGrid({ ...valid, slots })).toThrow(
            /slots|rungs/,
        );
    });

    it.each([0, -100])('throws naming lo for lo %s', (lo) => {
        expect(() => validateLadderGrid({ ...valid, lo })).toThrow(/lo/);
    });

    it('throws naming max when max is below lo', () => {
        expect(() =>
            validateLadderGrid({ lo: 300, max: 200, slots: 2, step: 100 }),
        ).toThrow(/max/);
    });

    it('returns a valid config unchanged', () => {
        expect(validateLadderGrid(valid)).toStrictEqual(valid);
    });
});

describe('ladderGridSize counts raw ladders without building them', () => {
    it.each([
        [{ lo: 100, max: 800, slots: 4, step: 100 }, 4680],
        [{ lo: 100, max: 800, slots: 4, step: 50 }, 54_240],
        [{ lo: 100, max: 800, slots: 5, step: 50 }, 813_615],
    ])('%o has %i ladders', (config, size) => {
        expect(ladderGridSize(config)).toBe(size);
    });

    it.each([
        { lo: 100, max: 300, slots: 1, step: 100 },
        { lo: 100, max: 300, slots: 2, step: 100 },
        { lo: 100, max: 300, slots: 3, step: 100 },
        { lo: 100, max: 800, slots: 4, step: 100 },
    ])('matches buildLadderGrid length for %o', (config) => {
        expect(buildLadderGrid(config).length).toBe(ladderGridSize(config));
    });

    it('stays finite for an enormous grid instead of overflowing', () => {
        const size = ladderGridSize({ lo: 1, max: 1e6, slots: 10, step: 1 });
        expect(Number.isFinite(size)).toBe(true);
        expect(size).toBeGreaterThan(MAX_LADDER_GRID_SIZE);
    });
});

describe('buildLadderGrid fails fast instead of hanging or running out of memory', () => {
    it.each([0, -100])('throws synchronously for step %s', (step) => {
        expect(() =>
            buildLadderGrid({ lo: 100, max: 200, slots: 2, step }),
        ).toThrow(/step/);
    });

    it('throws the rungs message for fractional slots, not a stack overflow', () => {
        expect(() =>
            buildLadderGrid({ lo: 100, max: 200, slots: 2.5, step: 100 }),
        ).toThrow(/slots|rungs/);
    });

    it('rejects a 41.5M ladder grid before allocating it', () => {
        expect(MAX_LADDER_GRID_SIZE).toBe(1_000_000);
        const started = performance.now();
        expect(() =>
            buildLadderGrid({ lo: 10, max: 800, slots: 4, step: 10 }),
        ).toThrow(/above the 1,000,000 limit/);
        expect(performance.now() - started).toBeLessThan(100);
    });

    it('accepts a grid above the default limit when a larger limit is passed', () => {
        const config = { lo: 100, max: 300, slots: 3, step: 100 };
        expect(() => buildLadderGrid(config, 10)).toThrow(/above the 10 limit/);
        expect(buildLadderGrid(config, 39)).toHaveLength(39);
    });

    it.each([0, -1, 2.5, NaN])('rejects a grid limit of %s', (limit) => {
        expect(() => buildLadderGrid(valid, limit)).toThrow(/limit/);
    });

    it('builds rung values by index so a floating step reaches max', () => {
        const grid = buildLadderGrid({
            lo: 0.1,
            max: 0.3,
            slots: 1,
            step: 0.1,
        });
        expect(grid).toHaveLength(3);
        expect(grid.map((ladder) => ladder[0])).toContain(0.3);
    });
});

function caught(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error('expected the action to throw');
}

const labels: LadderGridLabels = {
    lo: 'Low',
    max: 'High',
    slots: 'Count',
    step: 'Gap',
};

describe('defaultLadderGridMax puts the default largest rung at 40% of the cushion', () => {
    it.each([
        [2000, 800],
        [2500, 1000],
        [1250, 500],
        [3333, 1333],
    ])('cushion %i gives %i', (cushion, max) => {
        expect(defaultLadderGridMax(cushion)).toBe(max);
    });
});

describe('ladder grid errors are structured and name no front end control', () => {
    it('throws a LadderGridFieldError carrying the field and value', () => {
        const error = caught(() => validateLadderGrid({ ...valid, step: 0 }));
        expect(error).toBeInstanceOf(LadderGridFieldError);
        expect(error).toBeInstanceOf(LadderGridError);
        expect(error).toBeInstanceOf(RangeError);
        expect(error).toMatchObject({ field: 'step', value: 0 });
        expect((error as Error).message).not.toContain('--');
    });

    it('describes a field error with the caller labels', () => {
        const error = caught(() =>
            validateLadderGrid({ ...valid, slots: 2.5 }),
        ) as LadderGridError;
        expect(error.describe(labels)).toBe(
            'Count must be a whole number, got "2.5"',
        );
    });

    it('describes max below lo with both caller labels', () => {
        const error = caught(() =>
            validateLadderGrid({ lo: 300, max: 200, slots: 2, step: 100 }),
        ) as LadderGridError;
        expect(error).toMatchObject({ field: 'max', value: 200 });
        expect(error.describe(labels)).toBe('High must be >= Low, got "200"');
    });

    it('throws a LadderGridSizeError carrying size and limit, with no flag names', () => {
        const error = caught(() =>
            buildLadderGrid({ lo: 10, max: 800, slots: 4, step: 10 }),
        );
        expect(error).toBeInstanceOf(LadderGridSizeError);
        expect(error).toMatchObject({ limit: 1_000_000, size: 41_478_480 });
        expect((error as Error).message).toBe(
            'ladder grid has 41,478,480 ladders, above the 1,000,000 limit',
        );
    });

    it('describes a size error with the caller labels and an optional limit control', () => {
        const error = caught(() =>
            buildLadderGrid({ lo: 100, max: 300, slots: 3, step: 100 }, 10),
        ) as LadderGridError;
        expect(error.describe(labels)).toBe(
            'ladder grid has 39 ladders, above the 10 limit: raise Gap, lower Count or narrow Low/High',
        );
        expect(error.describe({ ...labels, limit: 'Cap' })).toBe(
            'ladder grid has 39 ladders, above the 10 limit: raise Gap, lower Count, narrow Low/High or raise Cap',
        );
    });
});

describe('describeLadderGridFailure words grid errors with the LadderLab field labels', () => {
    it('names the Step field for a zero step', () => {
        expect(
            describeLadderGridFailure(
                caught(() => buildLadderGrid({ ...valid, step: 0 })),
            ),
        ).toBe('Step must be > 0, got "0"');
    });

    it('names Max rung and Min rung when max is below lo', () => {
        expect(
            describeLadderGridFailure(
                caught(() =>
                    buildLadderGrid({ lo: 300, max: 200, slots: 2, step: 100 }),
                ),
            ),
        ).toBe('Max rung must be >= Min rung, got "200"');
    });

    it('suggests only web controls for an oversized grid', () => {
        const reason = describeLadderGridFailure(
            caught(() =>
                buildLadderGrid({ lo: 10, max: 800, slots: 4, step: 10 }),
            ),
        );
        expect(reason).toBe(
            'ladder grid has 41,478,480 ladders, above the 1,000,000 limit: raise Step, lower Rungs or narrow Min rung/Max rung',
        );
        expect(reason).not.toContain('--');
    });

    it('passes other errors through by message', () => {
        expect(describeLadderGridFailure(new Error('boom'))).toBe('boom');
        expect(describeLadderGridFailure('plain')).toBe('plain');
    });
});
