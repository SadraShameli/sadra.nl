export interface MetricBand<T> {
    readonly min: number;
    readonly value: T;
}

export function classifyMetric<T>(
    value: number,
    bandsDescending: readonly MetricBand<T>[],
    fallback: T,
): T {
    for (const band of bandsDescending) {
        if (value > band.min) return band.value;
    }
    return fallback;
}

const PTDD_BANDS: readonly MetricBand<string>[] = [
    { min: 2, value: 'text-destructive' },
    { min: 1.5, value: 'text-warning' },
    { min: 1, value: 'text-foreground' },
];

export function ptddColor(ratio: number): string {
    return classifyMetric(ratio, PTDD_BANDS, 'text-success');
}
