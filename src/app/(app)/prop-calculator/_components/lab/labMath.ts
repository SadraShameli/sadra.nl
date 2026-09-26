export function gamblersRuinAsymmetric(
    p: number,
    rr: number,
    target: number,
    dd: number,
): number {
    if (p <= 0) return 0;
    if (p >= 1 || target <= 0) return 1;
    if (dd <= 0) return 0;

    const targetUnits = Math.max(1, Math.round(target));
    const ddUnits = Math.max(1, Math.round(dd));
    const rUnits = Math.max(1, Math.round(rr));

    const lo = -ddUnits;
    const hi = targetUnits;
    const total = hi - lo + 1;
    const previous = Array.from({ length: total }, () => 0);
    for (let index = 0; index < total; index++) {
        const x = lo + index;
        previous[index] = x >= hi ? 1 : 0;
    }
    const q = 1 - p;
    const next = Array.from({ length: total }, () => 0);
    const maxIter = 4000;
    for (let iter = 0; iter < maxIter; iter++) {
        let maxDelta = 0;
        for (let index = 0; index < total; index++) {
            const x = lo + index;
            if (x <= lo) {
                next[index] = 0;
            } else if (x >= hi) {
                next[index] = 1;
            } else {
                const upIndex = Math.min(total - 1, index + rUnits);
                const downIndex = Math.max(0, index - 1);
                const upValue =
                    lo + upIndex >= hi ? 1 : (previous[upIndex] ?? 0);
                const downValue =
                    lo + downIndex <= lo ? 0 : (previous[downIndex] ?? 0);
                const v = p * upValue + q * downValue;
                const delta = Math.abs(v - (previous[index] ?? 0));
                if (delta > maxDelta) maxDelta = delta;
                next[index] = v;
            }
        }
        for (let index = 0; index < total; index++)
            previous[index] = next[index] ?? 0;
        if (maxDelta < 1e-9) break;
    }

    const startIndex = -lo;
    return previous[startIndex] ?? 0;
}

export function probStreakAtLeast(N: number, k: number, q: number): number {
    if (k <= 0) return 1;
    if (N < k || q <= 0) return 0;
    if (q >= 1) return 1;
    const expected = (N - k + 1) * Math.pow(q, k);
    return 1 - Math.exp(-expected);
}
