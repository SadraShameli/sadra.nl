export function clampInt(
    n: number,
    lo: number,
    hi: number,
    fallback: number,
): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, Math.floor(n)));
}

export function clampNumber(
    n: number,
    lo: number,
    hi: number,
    fallback: number,
): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
}
