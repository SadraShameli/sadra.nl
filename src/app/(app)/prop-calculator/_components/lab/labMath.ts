export function probStreakAtLeast(N: number, k: number, q: number): number {
    if (k <= 0) return 1;
    if (N < k || q <= 0) return 0;
    if (q >= 1) return 1;
    const expected = (N - k + 1) * Math.pow(q, k);
    return 1 - Math.exp(-expected);
}

export function expectedMaxLossStreak(N: number, winrate: number): number {
    if (N <= 0) return 0;
    const q = 1 - winrate;
    if (q <= 0) return 0;
    if (q >= 1) return N;
    const num = Math.log(N * winrate);
    const den = Math.log(1 / q);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
    return Math.max(0, num / den);
}

const ruinCache = new Map<string, number>();

export function gamblersRuinAsymmetric(
    p: number,
    rr: number,
    target: number,
    dd: number,
): number {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    if (target <= 0) return 1;
    if (dd <= 0) return 0;

    const targetUnits = Math.max(1, Math.round(target));
    const ddUnits = Math.max(1, Math.round(dd));
    const rUnits = Math.max(1, Math.round(rr));
    const key = `${p.toFixed(4)}|${rUnits}|${targetUnits}|${ddUnits}`;
    const cached = ruinCache.get(key);
    if (cached !== undefined) return cached;

    const lo = -ddUnits;
    const hi = targetUnits;
    const total = hi - lo + 1;
    const prev = new Array<number>(total).fill(0);
    for (let i = 0; i < total; i++) {
        const x = lo + i;
        prev[i] = x >= hi ? 1 : 0;
    }
    const q = 1 - p;
    const next = new Array<number>(total).fill(0);
    const maxIter = 4000;
    for (let iter = 0; iter < maxIter; iter++) {
        let maxDelta = 0;
        for (let i = 0; i < total; i++) {
            const x = lo + i;
            if (x <= lo) {
                next[i] = 0;
                continue;
            }
            if (x >= hi) {
                next[i] = 1;
                continue;
            }
            const upIdx = Math.min(total - 1, i + rUnits);
            const downIdx = Math.max(0, i - 1);
            const upVal = lo + upIdx >= hi ? 1 : prev[upIdx]!;
            const downVal = lo + downIdx <= lo ? 0 : prev[downIdx]!;
            const v = p * upVal + q * downVal;
            const delta = Math.abs(v - prev[i]!);
            if (delta > maxDelta) maxDelta = delta;
            next[i] = v;
        }
        for (let i = 0; i < total; i++) prev[i] = next[i]!;
        if (maxDelta < 1e-9) break;
    }

    const startIdx = -lo;
    const result = prev[startIdx]!;
    ruinCache.set(key, result);
    return result;
}

function logBinomCoef(n: number, k: number): number {
    if (k < 0 || k > n) return -Infinity;
    if (k === 0 || k === n) return 0;
    let s = 0;
    const kk = Math.min(k, n - k);
    for (let i = 1; i <= kk; i++) {
        s += Math.log(n - kk + i) - Math.log(i);
    }
    return s;
}

export function binomialDistribution(N: number, p: number): number[] {
    const out = new Array<number>(N + 1).fill(0);
    if (N <= 0) {
        out[0] = 1;
        return out;
    }
    const pp = Math.min(1, Math.max(0, p));
    if (pp === 0) {
        out[0] = 1;
        return out;
    }
    if (pp === 1) {
        out[N] = 1;
        return out;
    }
    const logP = Math.log(pp);
    const logQ = Math.log(1 - pp);
    for (let k = 0; k <= N; k++) {
        out[k] = Math.exp(logBinomCoef(N, k) + k * logP + (N - k) * logQ);
    }
    return out;
}

export function probAtLeastKofN(N: number, K: number, p: number): number {
    if (K <= 0) return 1;
    if (K > N) return 0;
    const dist = binomialDistribution(N, p);
    let s = 0;
    for (let k = K; k <= N; k++) s += dist[k]!;
    return s;
}

export function groupedPassDistribution(
    N: number,
    groups: number,
    perGroupP: number,
): number[] {
    const out = new Array<number>(N + 1).fill(0);
    if (N <= 0) {
        out[0] = 1;
        return out;
    }
    const G = Math.max(1, Math.min(groups, N));
    const baseSize = Math.floor(N / G);
    const extra = N - baseSize * G;
    const groupSizes: number[] = [];
    for (let g = 0; g < G; g++) {
        groupSizes.push(baseSize + (g < extra ? 1 : 0));
    }
    out[0] = 1;
    let totalSeen = 0;
    let working = out.slice();
    for (const size of groupSizes) {
        const next = new Array<number>(N + 1).fill(0);
        const fail = 1 - perGroupP;
        const newTotal = totalSeen + size;
        for (let k = 0; k <= totalSeen; k++) {
            const pk = working[k]!;
            if (pk === 0) continue;
            next[k]! += pk * fail;
            const idxPass = k + size;
            if (idxPass <= N) next[idxPass]! += pk * perGroupP;
        }
        working = next;
        totalSeen = newTotal;
    }
    for (let k = 0; k <= N; k++) out[k] = working[k]!;
    return out;
}
