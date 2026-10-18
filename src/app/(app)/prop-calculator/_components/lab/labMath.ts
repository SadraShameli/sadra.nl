export { twoBarrierPassProbability as gamblersRuinAsymmetric } from '~/lib/prop-calculator/economics';

export function probStreakAtLeast(N: number, k: number, q: number): number {
    if (k <= 0) return 1;
    if (N < k || q <= 0) return 0;
    if (q >= 1) return 1;
    const expected = (N - k + 1) * Math.pow(q, k);
    return 1 - Math.exp(-expected);
}
