export function lockThresholdAt(offset: number): (start: number) => number {
    return (start) => start + offset;
}

export function planLabel(accountSize: number, suffix: string): string {
    return `$${(accountSize / 1000).toFixed(0)}K — ${suffix}`;
}
