import { describe, expect, it } from 'vitest';

import {
    calibrateStepProbability,
    simulateTradePath,
    type TradePathResult,
} from '~/lib/prop-calculator/core/TradePathSimulation';
import { mulberry32 } from '~/lib/prop-calculator/rng';

function alwaysStepDown() {
    return 0.99;
}

describe('calibrateStepProbability', () => {
    it('at p=0.5 reproduces the classical a/(a+b) gambler-ruin formula (stepsPerR=10, rrRatio=2 => a=10, b=20, winrate=1/3)', () => {
        const p = calibrateStepProbability(1 / 3, 2, 10);
        expect(p).toBeCloseTo(0.5, 9);
    });

    it('matches a hand-computed asymmetric case via the general formula (a=2, b=1, p=0.6 => winrate=15/19)', () => {
        const p = calibrateStepProbability(15 / 19, 0.5, 2);
        expect(p).toBeCloseTo(0.6, 9);
    });

    it('throws for winrate outside (0, 1) exclusive', () => {
        expect(() => calibrateStepProbability(0, 2, 10)).toThrow();
        expect(() => calibrateStepProbability(1, 2, 10)).toThrow();
        expect(() => calibrateStepProbability(-0.1, 2, 10)).toThrow();
        expect(() => calibrateStepProbability(1.1, 2, 10)).toThrow();
    });

    it('throws for a stepsPerR that is not a positive integer', () => {
        expect(() => calibrateStepProbability(0.5, 2, 0)).toThrow();
        expect(() => calibrateStepProbability(0.5, 2, -5)).toThrow();
        expect(() => calibrateStepProbability(0.5, 2, 2.5)).toThrow();
    });
});

describe('simulateTradePath', () => {
    const rrRatio = 2;
    const stepsPerR = 10;

    it('round-trips with calibrateStepProbability: empirical win fraction over many trials converges to the target winrate', () => {
        const targetWinrate = 0.45;
        const p = calibrateStepProbability(targetWinrate, rrRatio, stepsPerR);
        const rng = mulberry32(777);

        const trials = 20_000;
        let wins = 0;
        for (let index = 0; index < trials; index++) {
            const result = simulateTradePath(
                p,
                stepsPerR,
                rrRatio,
                rng,
                100_000,
            );
            if (result.outcome === 'win') wins += 1;
        }

        expect(wins / trials).toBeCloseTo(targetWinrate, 2);
    });

    it('always reports peakR exactly equal to rrRatio for a winning outcome', () => {
        const p = calibrateStepProbability(0.45, rrRatio, stepsPerR);
        const rng = mulberry32(42);

        let isSawWin = false;
        for (let index = 0; index < 2000; index++) {
            const result = simulateTradePath(
                p,
                stepsPerR,
                rrRatio,
                rng,
                100_000,
            );
            if (result.outcome !== 'win') {
                continue;
            }

            isSawWin = true;
            expect(result.peakR).toBe(rrRatio);
        }
        expect(isSawWin).toBe(true);
    });

    it('always reports peakR in [0, rrRatio) for a losing outcome', () => {
        const p = calibrateStepProbability(0.45, rrRatio, stepsPerR);
        const rng = mulberry32(43);

        let isSawLoss = false;
        for (let index = 0; index < 2000; index++) {
            const result = simulateTradePath(
                p,
                stepsPerR,
                rrRatio,
                rng,
                100_000,
            );
            if (result.outcome !== 'loss') {
                continue;
            }

            isSawLoss = true;
            expect(result.peakR).toBeGreaterThanOrEqual(0);
            expect(result.peakR).toBeLessThan(rrRatio);
        }
        expect(isSawLoss).toBe(true);
    });

    it('resolves a truncated path from the exact absorption probability, not the nearer barrier', () => {
        const result = simulateTradePath(
            0.5,
            stepsPerR,
            rrRatio,
            scriptedRng([0.99, 0.99, 0.99, 0.1]),
            3,
        );

        expect(result).toEqual({ outcome: 'win', peakR: rrRatio, steps: 3 });
    });

    it('samples the losing peak from the conditional running-maximum law after truncation', () => {
        const result = simulateTradePath(
            0.5,
            stepsPerR,
            rrRatio,
            scriptedRng([0, 0, 0, 0.5, 0.5]),
            3,
        );

        expect(result.outcome).toBe('loss');
        expect(result.peakR).toBeCloseTo(0.8, 12);
        expect(result.steps).toBe(3);
    });

    it('truncation keeps the calibrated winrate even when every path is cut after one step', () => {
        const p = calibrateStepProbability(0.4, 3, 10);
        const results = runTrials(p, 10, 3, mulberry32(2024), 1, 100_000);

        expect(winFraction(results)).toBeCloseTo(0.4, 2);
    });

    it('truncation-heavy walks (maxSteps 50) keep the calibrated winrate', () => {
        const p = calibrateStepProbability(0.4, 3, 10);
        const results = runTrials(p, 10, 3, mulberry32(99), 50, 100_000);
        const truncated = results.filter((result) => result.steps === 50);

        expect(truncated.length / results.length).toBeGreaterThan(0.5);
        expect(winFraction(results)).toBeCloseTo(0.4, 2);
    });

    it('losing-peak distribution is invariant to the cap', () => {
        const p = calibrateStepProbability(0.4, rrRatio, stepsPerR);
        const truncatedLosses = runTrials(
            p,
            stepsPerR,
            rrRatio,
            mulberry32(5),
            1,
            50_000,
        ).filter((result) => result.outcome === 'loss');
        const resolvedLosses = runTrials(
            p,
            stepsPerR,
            rrRatio,
            mulberry32(6),
            100_000,
            50_000,
        ).filter((result) => result.outcome === 'loss');

        expect(
            Math.abs(meanPeakR(truncatedLosses) - meanPeakR(resolvedLosses)),
        ).toBeLessThan(0.01);
        expect(
            Math.abs(
                fractionPeakAtLeastOneR(truncatedLosses) -
                    fractionPeakAtLeastOneR(resolvedLosses),
            ),
        ).toBeLessThan(0.01);
    });

    it('truncated paths report peakR === rrRatio on wins and peakR in [0, rrRatio) on losses', () => {
        const p = calibrateStepProbability(0.4, rrRatio, stepsPerR);
        const results = runTrials(
            p,
            stepsPerR,
            rrRatio,
            mulberry32(31),
            1,
            5000,
        );
        const wins = results.filter((result) => result.outcome === 'win');
        const losses = results.filter((result) => result.outcome === 'loss');

        expect(wins.length).toBeGreaterThan(0);
        expect(losses.length).toBeGreaterThan(0);
        for (const win of wins) {
            expect(win.peakR).toBe(rrRatio);
        }
        for (const loss of losses) {
            expect(loss.peakR).toBeGreaterThanOrEqual(0);
            expect(loss.peakR).toBeLessThan(rrRatio);
        }
        expect(losses.some((loss) => loss.peakR > 0.1)).toBe(true);
    });

    it('rng draw count is unchanged for paths that resolve before the cap and is cap + 1 (win) or cap + 2 (loss) when truncated', () => {
        const p = calibrateStepProbability(0.4, rrRatio, stepsPerR);
        const counter = countingRng(mulberry32(12));

        for (let index = 0; index < 500; index++) {
            const before = counter.draws();
            const result = simulateTradePath(
                p,
                stepsPerR,
                rrRatio,
                counter.rng,
                100_000,
            );
            expect(counter.draws() - before).toBe(result.steps);
        }

        let isSawTruncatedWin = false;
        let isSawTruncatedLoss = false;
        for (let index = 0; index < 500; index++) {
            const before = counter.draws();
            const result = simulateTradePath(
                p,
                stepsPerR,
                rrRatio,
                counter.rng,
                3,
            );
            const draws = counter.draws() - before;
            expect(result.steps).toBe(3);
            if (result.outcome === 'win') {
                isSawTruncatedWin = true;
                expect(draws).toBe(4);
            } else {
                isSawTruncatedLoss = true;
                expect(draws).toBe(5);
            }
        }
        expect(isSawTruncatedWin).toBe(true);
        expect(isSawTruncatedLoss).toBe(true);
    });

    it('handles p = 0 and p = 1 at the cap without NaN', () => {
        const certainWin = simulateTradePath(
            1,
            stepsPerR,
            rrRatio,
            alwaysStepDown,
            3,
        );
        expect(certainWin).toEqual({
            outcome: 'win',
            peakR: rrRatio,
            steps: 3,
        });

        const certainLoss = simulateTradePath(
            0,
            stepsPerR,
            rrRatio,
            () => 0,
            3,
        );
        expect(certainLoss.outcome).toBe('loss');
        expect(Number.isFinite(certainLoss.peakR)).toBe(true);
        expect(certainLoss.peakR).toBeGreaterThanOrEqual(0);
        expect(certainLoss.peakR).toBeLessThan(rrRatio);
        expect(certainLoss.steps).toBe(3);
    });
});

function countingRng(source: () => number): {
    draws: () => number;
    rng: () => number;
} {
    let count = 0;
    return {
        draws: () => count,
        rng: () => {
            count += 1;
            return source();
        },
    };
}

function fractionPeakAtLeastOneR(results: readonly TradePathResult[]): number {
    return (
        results.filter((result) => result.peakR >= 1).length / results.length
    );
}

function meanPeakR(results: readonly TradePathResult[]): number {
    return (
        results.reduce((sum, result) => sum + result.peakR, 0) / results.length
    );
}

function runTrials(
    p: number,
    pathStepsPerR: number,
    pathRrRatio: number,
    rng: () => number,
    maxSteps: number,
    trials: number,
): TradePathResult[] {
    const results: TradePathResult[] = [];
    for (let index = 0; index < trials; index++) {
        results.push(
            simulateTradePath(p, pathStepsPerR, pathRrRatio, rng, maxSteps),
        );
    }
    return results;
}

function scriptedRng(draws: readonly number[]): () => number {
    let index = 0;
    return () => {
        const draw = draws[index];
        if (draw === undefined) throw new Error('script exhausted');
        index += 1;
        return draw;
    };
}

function winFraction(results: readonly TradePathResult[]): number {
    return (
        results.filter((result) => result.outcome === 'win').length /
        results.length
    );
}
