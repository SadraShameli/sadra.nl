import { describe, expect, it } from 'vitest';

import { RungSizing } from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

describe('the four trial outcomes exhaustively partition every trial', () => {
    it('sums bust, timeout, pass, and funded-bust probabilities to exactly 1', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                const out = simulate({
                    fundedHorizonDays: 60,
                    maxEvalDays: 100,
                    plan,
                    riskPerTrade: 500,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    seed: 11,
                    tradesPerDay: 2,
                    trials: 100,
                    winrate: 0.45,
                });

                const total =
                    out.bustProbability +
                    out.timeoutProbability +
                    out.passProbability +
                    out.fundedBustProbability;

                expect(total).toBeCloseTo(1, 9);
            }
        }
    });
});
