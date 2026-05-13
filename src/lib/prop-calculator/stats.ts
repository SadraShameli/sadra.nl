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
    for (let i = 0; i < binCount; i++) {
        const start = min + i * binWidth;
        const end = i === binCount - 1 ? max : start + binWidth;
        bins.push({
            binCenter: (start + end) / 2,
            binEnd: end,
            binStart: start,
            count: 0,
        });
    }
    for (const v of values) {
        let idx = Math.floor((v - min) / binWidth);
        if (idx >= binCount) idx = binCount - 1;
        if (idx < 0) idx = 0;
        const bin = bins[idx];
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
    const loVal = sorted[lo] ?? 0;
    const hiVal = sorted[hi] ?? 0;
    return loVal + (hiVal - loVal) * (rank - lo);
}

export function stdDev(arr: readonly number[]): number {
    if (arr.length === 0) return 0;
    const m = arr.reduce((s, v) => s + v, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
