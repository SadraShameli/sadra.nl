export interface HistogramBin {
    binCenter: number;
    binEnd: number;
    binStart: number;
    count: number;
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

export function mean(xs: readonly number[]): number {
    if (xs.length === 0) return 0;
    let sum = 0;
    for (const x of xs) sum += x;
    return sum / xs.length;
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

export function stdDev(array: readonly number[]): number {
    if (array.length === 0) return 0;
    const m = array.reduce((s, v) => s + v, 0) / array.length;
    return Math.sqrt(
        array.reduce((s, v) => s + (v - m) ** 2, 0) / array.length,
    );
}
