import { describe, expect, it } from 'vitest';

import {
    binomialStandardError,
    clamp,
    histogram,
    mean,
    meanStandardError,
    median,
    percentile,
    propagatedStandardError,
    standardDeviation,
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

describe('standardDeviation', () => {
    it('returns 0 for empty input', () => {
        expect(standardDeviation([])).toBe(0);
    });

    it('returns 0 when all values are equal', () => {
        expect(standardDeviation([5, 5, 5])).toBe(0);
    });

    it('computes population std-dev', () => {
        expect(standardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2), 6);
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

describe('binomialStandardError', () => {
    it('is sqrt(p(1-p)/n)', () => {
        expect(binomialStandardError(0.5, 10_000)).toBe(0.005);
        expect(binomialStandardError(0.2, 100)).toBeCloseTo(0.04, 12);
    });

    it('is 0 at a certain outcome', () => {
        expect(binomialStandardError(0, 100)).toBe(0);
        expect(binomialStandardError(1, 100)).toBe(0);
    });

    it('is 0 without samples', () => {
        expect(binomialStandardError(0.5, 0)).toBe(0);
    });
});

describe('meanStandardError', () => {
    it('uses the sample variance over n', () => {
        expect(meanStandardError(10, 30, 4)).toBeCloseTo(
            Math.sqrt(5 / 3 / 4),
            12,
        );
    });

    it('is 0 with fewer than two samples', () => {
        expect(meanStandardError(0, 0, 0)).toBe(0);
        expect(meanStandardError(7, 49, 1)).toBe(0);
    });

    it('is 0, never NaN, when rounding makes the variance slightly negative', () => {
        expect(meanStandardError(0.3, 0.029999999999999995, 3)).toBe(0);
    });
});

describe('propagatedStandardError', () => {
    it('scales a linear function by its slope', () => {
        expect(
            propagatedStandardError(
                (values) => 2 * (values[0] ?? 0),
                [{ standardError: 0.1, value: 1 }],
            ),
        ).toBeCloseTo(0.2, 12);
    });

    it('adds independent errors in quadrature', () => {
        expect(
            propagatedStandardError(
                (values) => (values[0] ?? 0) + (values[1] ?? 0),
                [
                    { standardError: 3, value: 10 },
                    { standardError: 4, value: 20 },
                ],
            ),
        ).toBeCloseTo(5, 12);
    });

    it('follows the local slope of a nonlinear function', () => {
        expect(
            propagatedStandardError(
                (values) => 1 / (values[0] ?? 1),
                [{ standardError: 0.01, value: 0.5 }],
            ),
        ).toBeCloseTo(0.04, 3);
    });

    it('is 0 when every input is exact', () => {
        expect(
            propagatedStandardError(
                (values) => 1 / (values[0] ?? 1),
                [{ standardError: 0, value: 0.5 }],
            ),
        ).toBe(0);
    });

    it('never steps an input across zero', () => {
        const seen: number[] = [];
        propagatedStandardError(
            (values) => {
                seen.push(values[0] ?? 0);
                return 1 / (values[0] ?? 1);
            },
            [{ standardError: 1, value: 0.1 }],
        );
        expect(Math.min(...seen)).toBeGreaterThan(0);
    });
});
