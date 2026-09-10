import { describe, expect, it } from 'vitest';

import { type Plan, RungSizing } from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { type SimOutputs, simulate } from '~/lib/prop-calculator/simulator';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => [...firm.plans]);

function run(plan: Plan): SimOutputs {
    return simulate({
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan,
        riskPerTrade: 400,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 150,
        winrate: 0.5,
    });
}

describe.each(ALL_PLANS)('$label', (plan) => {
    it('simulates identically under an empty override', () => {
        expect(run(plan.withOverrides({}))).toStrictEqual(run(plan));
    });
});
