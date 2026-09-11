import { describe, expect, it } from 'vitest';

import {
    calibrateStepProbability,
    simulateTradePath,
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
            if (result.outcome === 'win') {
                isSawWin = true;
                expect(result.peakR).toBe(rrRatio);
            }
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
            if (result.outcome === 'loss') {
                isSawLoss = true;
                expect(result.peakR).toBeGreaterThanOrEqual(0);
                expect(result.peakR).toBeLessThan(rrRatio);
            }
        }
        expect(isSawLoss).toBe(true);
    });

    it('engages the maxSteps safety valve and force-resolves toward the nearer barrier instead of hanging', () => {
        const result = simulateTradePath(
            0.5,
            stepsPerR,
            rrRatio,
            alwaysStepDown,
            3,
        );

        expect(result.steps).toBe(3);
        expect(result.outcome).toBe('loss');
        expect(result.peakR).toBe(0);
    });
});
