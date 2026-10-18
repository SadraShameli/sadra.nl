export enum NoiseVerdict {
    BeyondNoise = 'beyond-noise',
    Unknown = 'unknown',
    WithinNoise = 'within-noise',
}

export interface Estimate {
    standardError: number;
    value: number;
}

export interface HistogramBin {
    binCenter: number;
    binEnd: number;
    binStart: number;
    count: number;
}

export type NoiseComparison =
    | {
          readonly differenceStandardError: null | number;
          readonly sharedSeed: true;
      }
    | { readonly sharedSeed: false };

export interface UncertainValue {
    readonly standardError: null | number;
    readonly value: number;
}

export interface WilsonInterval {
    readonly lower: number;
    readonly upper: number;
}

export const NOISE_STANDARD_ERRORS = 2;
export const NINETY_FIVE_PERCENT_Z = 1.959964;

export class ProportionRangeError extends RangeError {
    override name = 'ProportionRangeError';
}

export function binomialStandardError(p: number, n: number): number {
    return n <= 0 ? 0 : Math.sqrt((p * (1 - p)) / n);
}

export function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}

export function histogram(
    values: readonly number[],
    binCount: number,
): HistogramBin[] {
    if (values.length === 0 || binCount <= 0) return [];
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (min === max) {
        return [
            {
                binCenter: min,
                binEnd: min,
                binStart: min,
                count: values.length,
            },
        ];
    }
    const span = max - min;
    const binWidth = span / binCount;
    const bins: HistogramBin[] = [];
    for (let index = 0; index < binCount; index++) {
        const start = min + index * binWidth;
        const end = index === binCount - 1 ? max : start + binWidth;
        bins.push({
            binCenter: (start + end) / 2,
            binEnd: end,
            binStart: start,
            count: 0,
        });
    }
    for (const v of values) {
        let index = Math.floor((v - min) / binWidth);
        if (index >= binCount) index = binCount - 1;
        if (index < 0) index = 0;
        const bin = bins[index];
        if (bin) bin.count += 1;
    }
    return bins;
}

export function isBeyondNoise(
    a: UncertainValue,
    b: UncertainValue,
    comparison: NoiseComparison,
): boolean {
    return noiseVerdict(a, b, comparison) === NoiseVerdict.BeyondNoise;
}

export function mean(xs: readonly number[]): number {
    if (xs.length === 0) return 0;
    let sum = 0;
    for (const x of xs) sum += x;
    return sum / xs.length;
}

export function meanStandardError(
    sum: number,
    squaredSum: number,
    n: number,
): number {
    if (n < 2) return 0;
    const variance = (squaredSum - (sum * sum) / n) / (n - 1);
    return variance <= 0 ? 0 : Math.sqrt(variance / n);
}

export function median(xs: readonly number[]): number {
    if (xs.length === 0) return 0;
    const sorted = xs.toSorted((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        const lo = sorted[mid - 1] ?? 0;
        const hi = sorted[mid] ?? 0;
        return (lo + hi) / 2;
    }
    return sorted[mid] ?? 0;
}

export function noiseThreshold(
    a: UncertainValue,
    b: UncertainValue,
    comparison: NoiseComparison,
): null | number {
    const gapStandardError = comparison.sharedSeed
        ? validStandardError(comparison.differenceStandardError)
        : independentGapStandardError(a.standardError, b.standardError);
    return gapStandardError === null
        ? null
        : NOISE_STANDARD_ERRORS * gapStandardError;
}

export function noiseVerdict(
    a: UncertainValue,
    b: UncertainValue,
    comparison: NoiseComparison,
): NoiseVerdict {
    const gap = finiteValue(a.value) - finiteValue(b.value);
    const threshold = noiseThreshold(a, b, comparison);
    if (threshold === null) return NoiseVerdict.Unknown;
    return Math.abs(gap) <= threshold
        ? NoiseVerdict.WithinNoise
        : NoiseVerdict.BeyondNoise;
}

export function percentile(xs: readonly number[], p: number): number {
    if (xs.length === 0) return 0;
    const sorted = xs.toSorted((a, b) => a - b);
    const rank = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return sorted[lo] ?? 0;
    const loValue = sorted[lo] ?? 0;
    const hiValue = sorted[hi] ?? 0;
    return loValue + (hiValue - loValue) * (rank - lo);
}

export function propagatedStandardError(
    f: (values: readonly number[]) => number,
    estimates: readonly Estimate[],
): number {
    const center = estimates.map((estimate) => estimate.value);
    let variance = 0;
    for (const [index, estimate] of estimates.entries()) {
        const step = Math.min(
            estimate.standardError,
            Math.abs(estimate.value) / 2,
        );
        if (!(step > 0)) continue;
        const shifted = (offset: number) =>
            f(
                center.map((value, position) =>
                    position === index ? value + offset : value,
                ),
            );
        const slope = (shifted(step) - shifted(-step)) / (2 * step);
        variance += (slope * estimate.standardError) ** 2;
    }
    return Math.sqrt(variance);
}

export function ratioEstimate(
    numerators: readonly number[],
    denominators: readonly number[],
): Estimate {
    const n = numerators.length;
    if (denominators.length !== n) {
        throw new RangeError(
            `ratioEstimate needs one denominator per numerator, got ${n} numerators and ${denominators.length} denominators`,
        );
    }
    if (n === 0) {
        throw new RangeError('ratioEstimate needs at least one pair');
    }
    let numeratorSum = 0;
    let denominatorSum = 0;
    for (const [index, numerator] of numerators.entries()) {
        numeratorSum += numerator;
        denominatorSum += denominators[index] ?? 0;
    }
    if (denominatorSum === 0) {
        throw new RangeError(
            'ratioEstimate needs denominators that do not sum to 0',
        );
    }
    const ratio = numeratorSum / denominatorSum;
    if (n < 2) return { standardError: 0, value: ratio };
    let squaredResiduals = 0;
    for (const [index, numerator] of numerators.entries()) {
        const residual = numerator - ratio * (denominators[index] ?? 0);
        squaredResiduals += residual * residual;
    }
    const meanDenominator = denominatorSum / n;
    const residualVariance = squaredResiduals / (n - 1);
    return {
        standardError: Math.abs(
            Math.sqrt(residualVariance / n) / meanDenominator,
        ),
        value: ratio,
    };
}

export function standardDeviation(array: readonly number[]): number {
    if (array.length === 0) return 0;
    const m = array.reduce((s, v) => s + v, 0) / array.length;
    return Math.sqrt(
        array.reduce((s, v) => s + (v - m) ** 2, 0) / array.length,
    );
}

export function wilsonInterval(
    successes: number,
    n: number,
    z: number = NINETY_FIVE_PERCENT_Z,
): null | WilsonInterval {
    if (!Number.isSafeInteger(n) || n < 0) {
        throw new ProportionRangeError(
            `sample size must be a whole number >= 0, got ${n}`,
        );
    }
    if (!Number.isSafeInteger(successes) || successes < 0 || successes > n) {
        throw new ProportionRangeError(
            `successes must be a whole number from 0 to ${n}, got ${successes}`,
        );
    }
    if (!Number.isFinite(z) || z <= 0) {
        throw new ProportionRangeError(`z must be finite and > 0, got ${z}`);
    }
    if (n === 0) return null;
    const p = successes / n;
    const zSquared = z * z;
    const scale = 1 + zSquared / n;
    const center = (p + zSquared / (2 * n)) / scale;
    const halfWidth =
        (z * Math.sqrt((p * (1 - p)) / n + zSquared / (4 * n * n))) / scale;
    return {
        lower: successes === 0 ? 0 : clamp(center - halfWidth, 0, 1),
        upper: successes === n ? 1 : clamp(center + halfWidth, 0, 1),
    };
}

function finiteValue(value: number): number {
    if (!Number.isFinite(value)) {
        throw new RangeError(`a noise check needs finite values, got ${value}`);
    }
    return value;
}

function independentGapStandardError(
    a: null | number,
    b: null | number,
): null | number {
    const first = validStandardError(a);
    const second = validStandardError(b);
    return first === null || second === null ? null : Math.hypot(first, second);
}

function validStandardError(standardError: null | number): null | number {
    if (standardError === null) return null;
    if (!(standardError >= 0) || !Number.isFinite(standardError)) {
        throw new RangeError(
            `a standard error must be finite and >= 0, got ${standardError}`,
        );
    }
    return standardError;
}
