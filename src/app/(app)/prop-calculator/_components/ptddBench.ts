import { type Plan } from '~/lib/prop-calculator';

export enum PtddBench {
    Demanding = 'demanding',
    Easy = 'easy',
    Hard = 'hard',
    Typical = 'typical',
}

interface PtddBenchBand {
    readonly bench: PtddBench;
    readonly floor: number;
}

const PTDD_BENCH_BANDS: readonly PtddBenchBand[] = [
    { bench: PtddBench.Hard, floor: 2 },
    { bench: PtddBench.Demanding, floor: 1.5 },
    { bench: PtddBench.Typical, floor: 1 },
];

export function formatPtdd(ratio: number): string {
    return `${ratio.toFixed(2)}×`;
}

export function planPtdd(plan: Plan): number {
    return plan.profitTarget / plan.drawdown.amount;
}

export function ptddBench(ratio: number): PtddBench {
    return (
        PTDD_BENCH_BANDS.find(({ floor }) => ratio > floor)?.bench ??
        PtddBench.Easy
    );
}

export const PTDD_BENCH_SCALE = [
    ...PTDD_BENCH_BANDS.map(
        ({ bench, floor }) => `${bench} above ${formatPtdd(floor)}`,
    ),
    `${PtddBench.Easy} otherwise`,
].join(', ');
