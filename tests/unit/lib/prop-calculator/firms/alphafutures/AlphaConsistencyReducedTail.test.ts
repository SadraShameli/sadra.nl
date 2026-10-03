import { beforeAll, describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';

import { memoise } from '../../../../memoise';
import {
    alphaToy,
    lossExemptRuleOf,
    qualifiedAlphaRule,
} from './alphaConsistencyFixtures';

const lossExemptToy = alphaToy(lossExemptRuleOf(qualifiedAlphaRule()));

const reducedTailConfig = {
    actionStepMultiple: 1,
    cushionStepMultiple: 1,
    cycleBestDayBucketCount: 3,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxTailCushionMultiple: 13,
    plan: lossExemptToy,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
} as const;

const withHorizon = memoise(() =>
    computeFundedStateValue({ ...reducedTailConfig, meanHorizonDays: 400 }),
);

const withLiftedCap = memoise(() =>
    computeFundedStateValue({
        ...reducedTailConfig,
        maxIterationsPerLevel: 1000,
    }),
);

const withPlainCap = memoise(() => computeFundedStateValue(reducedTailConfig));

describe('N-90: the Alpha consistency toys at a 13 drawdown cushion tail converge whenever a funded horizon is given, as optimize dp always does (PT-T1c: this file solves a reduced tail, not the default 30 drawdown tail, whose convergence is no longer asserted in the unit suite and is guarded by the engine audit N-90c measurement of a complete optimize dp run at default flags on Alpha Standard 50K on the build PC; the default tail, a 0.25 cushion step, a 0.5 action step and 25 best-day buckets took 464 s and 360 s for the two solves below; this grid is a 1 drawdown cushion step, a 1 drawdown action step, 3 best-day buckets and a 13 drawdown tail, where the plain 200 sweep cap still stops a level when no horizon is given)', () => {
    beforeAll(() => {
        withHorizon();
    });

    beforeAll(() => {
        withLiftedCap();
    });

    beforeAll(() => {
        withPlainCap();
    });

    it('solves the loss-exempt toy, the one that needs the most sweeps, at the tail with every level converged once meanHorizonDays is set, so the geometric hazard sets the sweep cap', () => {
        const result = withHorizon();
        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.initialValue).toBeGreaterThan(0);
    });

    it('solves the loss-exempt toy at the tail with every level converged without a horizon once maxIterationsPerLevel lifts the plain 200 sweep cap', () => {
        const uncapped = withLiftedCap();
        expect(uncapped.unconvergedLevelCount).toBe(0);
        expect(uncapped.initialValue).toBeGreaterThan(0);
    });

    it('stops the loss-exempt toy at the plain 200 sweep cap on a level at this tail when no horizon is given (hazard 0, no contraction), so the two tests above prove something', () => {
        expect(withPlainCap().unconvergedLevelCount).toBeGreaterThan(0);
    });
});
