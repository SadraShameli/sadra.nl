import { describe, expect, it } from 'vitest';

import {
    clamp,
    histogram,
    mean,
    median,
    percentile,
    stdDev,
} from '~/lib/prop-calculator/stats';

describe('clamp', () => {
    it('returns the value when in range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to the lower bound', () => {
        expect(clamp(-3, 0, 10)).toBe(0);
    });

    it('clamps to the upper bound', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });
});

describe('mean', () => {
    it('returns 0 for empty input', () => {
        expect(mean([])).toBe(0);
    });

    it('computes arithmetic mean', () => {
        expect(mean([1, 2, 3, 4])).toBe(2.5);
    });

    it('handles negatives', () => {
        expect(mean([-1, 1])).toBe(0);
    });
});

describe('median', () => {
    it('returns 0 for empty input', () => {
        expect(median([])).toBe(0);
    });

    it('returns the middle of an odd-length array', () => {
        expect(median([3, 1, 2])).toBe(2);
    });

    it('averages the two middle values of an even-length array', () => {
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it('does not mutate the input', () => {
        const input = [3, 1, 2];
        median(input);
        expect(input).toEqual([3, 1, 2]);
    });
});

describe('percentile', () => {
    it('returns 0 for empty input', () => {
        expect(percentile([], 50)).toBe(0);
    });

    it('returns p0 = min and p100 = max', () => {
        expect(percentile([1, 5, 10], 0)).toBe(1);
        expect(percentile([1, 5, 10], 100)).toBe(10);
    });

    it('returns p50 ≈ median', () => {
        expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });

    it('interpolates between values for fractional ranks', () => {
        expect(percentile([10, 20], 50)).toBe(15);
    });
});

describe('stdDev', () => {
    it('returns 0 for empty input', () => {
        expect(stdDev([])).toBe(0);
    });

    it('returns 0 when all values are equal', () => {
        expect(stdDev([5, 5, 5])).toBe(0);
    });

    it('computes population std-dev', () => {
        expect(stdDev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2), 6);
    });
});

describe('histogram', () => {
    it('returns [] for empty input', () => {
        expect(histogram([], 5)).toEqual([]);
    });

    it('returns [] for binCount <= 0', () => {
        expect(histogram([1, 2, 3], 0)).toEqual([]);
    });

    it('collapses to a single bin when all values are equal', () => {
        const bins = histogram([5, 5, 5], 5);
        expect(bins).toHaveLength(1);
        expect(bins[0]?.count).toBe(3);
    });

    it('produces binCount bins that cover the value range', () => {
        const bins = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5);
        expect(bins).toHaveLength(5);
        const total = bins.reduce((s, b) => s + b.count, 0);
        expect(total).toBe(10);
        expect(bins[0]?.binStart).toBe(0);
        expect(bins.at(-1)?.binEnd).toBe(9);
    });
});
