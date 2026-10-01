import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    binomialStandardError,
    clamp,
    histogram,
    isBeyondNoise,
    mean,
    meanStandardError,
    median,
    NOISE_STANDARD_ERRORS,
    noiseVerdict,
    NoiseVerdict,
    percentile,
    propagatedStandardError,
    ProportionRangeError,
    ratioEstimate,
    standardDeviation,
    wilsonInterval,
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

function squaredSumOf(xs: readonly number[]): number {
    return xs.reduce((sum, x) => sum + x * x, 0);
}

function sumOf(xs: readonly number[]): number {
    return xs.reduce((sum, x) => sum + x, 0);
}

describe('ratioEstimate', () => {
    it('gives sum(y) / sum(d) with the linearized SE sqrt(sum((y - R d)^2) / (n - 1) / n) / mean(d) on a hand-computed table', () => {
        const estimate = ratioEstimate([10, 12, 7, 21], [2, 3, 1, 4]);
        expect(estimate.value).toBe(5);
        expect(estimate.standardError).toBeCloseTo(
            Math.sqrt(14 / 3 / 4) / 2.5,
            12,
        );
        expect(estimate.standardError).toBeCloseTo(0.43204938, 9);
    });

    it('is 0 when y is proportional to d, where treating the two means as independent is not', () => {
        const numerators = [6, 9, 3, 12];
        const denominators = [2, 3, 1, 4];
        expect(ratioEstimate(numerators, denominators)).toStrictEqual({
            standardError: 0,
            value: 3,
        });
        const independent = propagatedStandardError(
            (values) => (values[0] ?? 0) / (values[1] ?? 1),
            [numerators, denominators].map((xs) => ({
                standardError: meanStandardError(
                    sumOf(xs),
                    squaredSumOf(xs),
                    xs.length,
                ),
                value: sumOf(xs) / xs.length,
            })),
        );
        expect(independent).toBeGreaterThan(0.5);
    });

    it('has SE 0 from a single pair', () => {
        expect(ratioEstimate([7], [2])).toStrictEqual({
            standardError: 0,
            value: 3.5,
        });
    });

    it('refuses an empty sample', () => {
        expect(() => ratioEstimate([], [])).toThrow(RangeError);
    });

    it('refuses numerators and denominators of different lengths', () => {
        expect(() => ratioEstimate([1, 2], [1])).toThrow(
            'ratioEstimate needs one denominator per numerator, got 2 numerators and 1 denominators',
        );
    });

    it('refuses denominators that sum to 0', () => {
        expect(() => ratioEstimate([1, 2], [0, 0])).toThrow(RangeError);
    });
});

describe('wilsonInterval', () => {
    it.each([
        { lower: 0, n: 10, successes: 0, upper: 0.277533 },
        { lower: 0.107791, n: 10, successes: 3, upper: 0.603222 },
        { lower: 0.722467, n: 10, successes: 10, upper: 1 },
    ])(
        'gives [$lower, $upper] for $successes of $n at 95%',
        ({ lower, n, successes, upper }) => {
            const interval = wilsonInterval(successes, n);
            expect(interval?.lower).toBeCloseTo(lower, 6);
            expect(interval?.upper).toBeCloseTo(upper, 6);
        },
    );

    it('keeps the bounds inside [0, 1] exactly at 0 of n and n of n', () => {
        expect(wilsonInterval(0, 10)?.lower).toBe(0);
        expect(wilsonInterval(10, 10)?.upper).toBe(1);
    });

    it('narrows with a smaller z', () => {
        const wide = wilsonInterval(3, 10);
        const narrow = wilsonInterval(3, 10, 1);
        expect(narrow?.lower).toBeGreaterThan(wide?.lower ?? 1);
        expect(narrow?.upper).toBeLessThan(wide?.upper ?? 0);
    });

    it('is null without samples', () => {
        expect(wilsonInterval(0, 0)).toBeNull();
    });

    it.each([
        { n: 10, successes: -1 },
        { n: 10, successes: 11 },
        { n: 10, successes: 2.5 },
        { n: -1, successes: 0 },
    ])(
        'refuses $successes successes of $n with a ProportionRangeError',
        ({ n, successes }) => {
            expect(() => wilsonInterval(successes, n)).toThrow(
                ProportionRangeError,
            );
        },
    );
});

describe('noiseVerdict', () => {
    it('uses two standard errors', () => {
        expect(NOISE_STANDARD_ERRORS).toBe(2);
    });

    it('compares independent runs against 2 x sqrt(SE_a^2 + SE_b^2), a gap on the line being within noise', () => {
        const b = { standardError: 4, value: 0 };
        const independent = { sharedSeed: false } as const;
        expect(
            noiseVerdict({ standardError: 3, value: 10 }, b, independent),
        ).toBe(NoiseVerdict.WithinNoise);
        expect(
            noiseVerdict({ standardError: 3, value: 10.5 }, b, independent),
        ).toBe(NoiseVerdict.BeyondNoise);
        expect(
            noiseVerdict({ standardError: 3, value: -10.5 }, b, independent),
        ).toBe(NoiseVerdict.BeyondNoise);
    });

    it('treats an exact reference as SE 0, so a single SE sets the band', () => {
        expect(
            noiseVerdict(
                { standardError: 0.05, value: 0.61 },
                { standardError: 0, value: 0.5 },
                { sharedSeed: false },
            ),
        ).toBe(NoiseVerdict.BeyondNoise);
    });

    it('uses only the paired-difference SE for runs that share a seed', () => {
        const a = { standardError: 3, value: 10.5 };
        const b = { standardError: 4, value: 8 };
        expect(
            noiseVerdict(a, b, {
                differenceStandardError: 1,
                sharedSeed: true,
            }),
        ).toBe(NoiseVerdict.BeyondNoise);
        expect(
            noiseVerdict({ ...a, value: 10 }, b, {
                differenceStandardError: 1,
                sharedSeed: true,
            }),
        ).toBe(NoiseVerdict.WithinNoise);
        expect(noiseVerdict(a, b, { sharedSeed: false })).toBe(
            NoiseVerdict.WithinNoise,
        );
    });

    it('returns Unknown, never a verdict, when a needed SE is null', () => {
        expect(
            noiseVerdict(
                { standardError: null, value: 1000 },
                { standardError: 1, value: 0 },
                { sharedSeed: false },
            ),
        ).toBe(NoiseVerdict.Unknown);
        expect(
            noiseVerdict(
                { standardError: 1, value: 0 },
                { standardError: null, value: 1000 },
                { sharedSeed: false },
            ),
        ).toBe(NoiseVerdict.Unknown);
        expect(
            noiseVerdict(
                { standardError: 1, value: 1000 },
                { standardError: 1, value: 0 },
                { differenceStandardError: null, sharedSeed: true },
            ),
        ).toBe(NoiseVerdict.Unknown);
    });

    it('refuses a negative or non-finite SE and a non-finite value', () => {
        const b = { standardError: 1, value: 0 };
        expect(() =>
            noiseVerdict({ standardError: -1, value: 1 }, b, {
                sharedSeed: false,
            }),
        ).toThrow(RangeError);
        expect(() =>
            noiseVerdict({ standardError: NaN, value: 1 }, b, {
                sharedSeed: false,
            }),
        ).toThrow(RangeError);
        expect(() =>
            noiseVerdict({ standardError: 1, value: NaN }, b, {
                sharedSeed: false,
            }),
        ).toThrow(RangeError);
        expect(() =>
            noiseVerdict({ standardError: 1, value: 1 }, b, {
                differenceStandardError: -1,
                sharedSeed: true,
            }),
        ).toThrow(RangeError);
    });
});

describe('isBeyondNoise (VD-25)', () => {
    it('is true exactly when noiseVerdict is BeyondNoise', () => {
        const b = { standardError: 4, value: 0 };
        const independent = { sharedSeed: false } as const;
        expect(
            isBeyondNoise({ standardError: 3, value: 10 }, b, independent),
        ).toBe(false);
        expect(
            isBeyondNoise({ standardError: 3, value: 10.5 }, b, independent),
        ).toBe(true);
    });

    it('is false, never a thrown verdict, when a needed SE is null (Unknown)', () => {
        expect(
            isBeyondNoise(
                { standardError: null, value: 1000 },
                { standardError: 1, value: 0 },
                { sharedSeed: false },
            ),
        ).toBe(false);
    });

    it('uses the paired-difference SE for a shared seed', () => {
        const a = { standardError: 3, value: 10.5 };
        const b = { standardError: 4, value: 8 };
        expect(
            isBeyondNoise(a, b, { differenceStandardError: 1, sharedSeed: true }),
        ).toBe(true);
        expect(
            isBeyondNoise(a, b, { sharedSeed: false }),
        ).toBe(false);
    });
});

describe('the beyond-noise threshold has one implementation (VD-25 guard)', () => {
    const PROP_CALCULATOR_ROOT = path.resolve(
        import.meta.dirname,
        '../../../../src/lib/prop-calculator',
    );
    const STATS_FILE = path.join(PROP_CALCULATOR_ROOT, 'stats.ts');
    const NOISE_THRESHOLD_PATTERN = /NOISE_STANDARD_ERRORS\s*\*/;

    function tsFilesUnder(dir: string): string[] {
        return readdirSync(dir, { recursive: true })
            .filter((name): name is string => typeof name === 'string')
            .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
            .map((name) => path.join(dir, name));
    }

    it('finds the SE multiple only in stats.ts, never a second copy elsewhere in prop-calculator', () => {
        const offenders = tsFilesUnder(PROP_CALCULATOR_ROOT)
            .filter((file) => file !== STATS_FILE)
            .filter((file) =>
                NOISE_THRESHOLD_PATTERN.test(readFileSync(file, 'utf8')),
            );
        expect(offenders).toEqual([]);
    });
});
