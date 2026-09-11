import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    calibrateStepProbability,
    createInitialState,
    dollars,
    IntradayTrailingDrawdown,
    simulateTradePath,
} from '~/lib/prop-calculator/core';

function stateAt(balance: number, threshold: number): AccountState {
    const state = createInitialState(50_000, threshold);
    state.balance = balance;
    return state;
}

describe('IntradayTrailingDrawdown.onTrade given a peak excursion', () => {
    it('ratchets the floor further when peakPnL exceeds the closed tradePnL', () => {
        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
        });

        const closedOnly = stateAt(51_000, 48_000);
        drawdown.onTrade(closedOnly, 1000);
        expect(closedOnly.threshold).toBe(49_000);

        const withPeak = stateAt(51_000, 48_000);
        drawdown.onTrade(withPeak, 1000, 3000);
        expect(withPeak.threshold).toBe(51_000);
        expect(withPeak.threshold).toBeGreaterThan(closedOnly.threshold);
    });

    it('reproduces the omitted-argument ratchet when peakPnL is passed equal to tradePnL', () => {
        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
        });

        const omitted = stateAt(51_000, 48_000);
        drawdown.onTrade(omitted, 1000);

        const explicit = stateAt(51_000, 48_000);
        drawdown.onTrade(explicit, 1000, 1000);

        expect(explicit.threshold).toBe(omitted.threshold);
    });
});

describe('a trade that runs up then reverses ratchets the floor further than its closed P&L alone', () => {
    it('a scripted path that peaks at 1.5R then reverses to a loss produces a higher floor than the final -1R loss would on its own', () => {
        const rrRatio = 2;
        const stepsPerR = 10;
        const risk = 250;
        const p = calibrateStepProbability(0.4, rrRatio, stepsPerR);

        const upSteps = 15;
        const downSteps = 25;
        const script: number[] = [
            ...Array.from({ length: upSteps }, () => 0),
            ...Array.from({ length: downSteps }, () => 1),
        ];
        let call = 0;
        const scriptedRng = () => {
            const value = script[call];
            if (value === undefined) throw new Error('script exhausted');
            call += 1;
            return value;
        };

        const path = simulateTradePath(
            p,
            stepsPerR,
            rrRatio,
            scriptedRng,
            1000,
        );
        expect(path.outcome).toBe('loss');
        expect(path.peakR).toBeCloseTo(1.5, 10);

        const finalPnl = -risk;
        const peakPnl = path.peakR * risk;

        const drawdown = new IntradayTrailingDrawdown({
            amount: dollars(2000),
        });
        const closedOnly = stateAt(51_000, 48_000);
        drawdown.onTrade(closedOnly, finalPnl);

        const withPeak = stateAt(51_000, 48_000);
        drawdown.onTrade(withPeak, finalPnl, peakPnl);

        expect(withPeak.threshold).toBeGreaterThan(closedOnly.threshold);
        expect(withPeak.threshold - closedOnly.threshold).toBeCloseTo(
            peakPnl - finalPnl,
            6,
        );
    });
});
