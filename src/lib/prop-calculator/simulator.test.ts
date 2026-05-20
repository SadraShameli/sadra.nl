import { describe, expect, it } from 'vitest';

import { ApexTraderFunding } from './firms/apex/ApexTraderFunding';
import { type SimInputs, simulate } from './simulator';

const firm = new ApexTraderFunding();
const firstPlan = firm.plans[0];
if (!firstPlan) throw new Error('Apex must expose at least one plan for tests');
const plan = firstPlan;

function baseInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 60,
        maxEvalDays: 60,
        plan,
        riskPerTrade: 0.005,
        rrRatio: 2,
        seed: 12_345,
        tradesPerDay: 3,
        trials: 200,
        winrate: 0.5,
        ...overrides,
    };
}

describe('simulate', () => {
    it('returns probabilities in the [0,1] range', () => {
        const out = simulate(baseInputs());
        expect(out.passProbability).toBeGreaterThanOrEqual(0);
        expect(out.passProbability).toBeLessThanOrEqual(1);
        expect(out.bustProbability).toBeGreaterThanOrEqual(0);
        expect(out.bustProbability).toBeLessThanOrEqual(1);
    });

    it('is deterministic for the same seed', () => {
        const a = simulate(baseInputs({ seed: 42 }));
        const b = simulate(baseInputs({ seed: 42 }));
        expect(a.passProbability).toBe(b.passProbability);
        expect(a.expectancyR).toBe(b.expectancyR);
    });

    it('expectancyR is positive when EV is positive and finite', () => {
        const out = simulate(
            baseInputs({ rrRatio: 2, trials: 100, winrate: 0.6 }),
        );
        expect(Number.isFinite(out.expectancyR)).toBe(true);
        expect(out.expectancyR).toBeGreaterThan(0);
    });

    it('outputs never contain NaN or Infinity for valid inputs', () => {
        const out = simulate(baseInputs());
        for (const [key, value] of Object.entries(out)) {
            if (typeof value !== 'number') continue;
            expect(Number.isFinite(value), `${key} was ${value}`).toBe(true);
        }
    });
});
