import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';

import { exactFundedPolicyValue } from '../fundedStateValueToy';
import {
    alphaToy,
    lossExemptRuleOf,
    qualifiedAlphaRule,
} from '../firms/alphafutures/alphaConsistencyFixtures';

describe('probe', () => {
    it.each([
        [6, 40],
        [20, 100],
    ])('alpha qualified horizon %s depth %s', (meanHorizonDays, depth) => {
        const rule = qualifiedAlphaRule();
        const cfg = {
            actionStepMultiple: 0.5,
            convergenceTolerance: 1e-9,
            cushionStepMultiple: 0.25,
            cycleBestDayBucketCount: 10,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            maxTailCushionMultiple: 6,
            meanHorizonDays,
            plan: alphaToy(rule),
            rrRatio: 2,
            tradesPerDay: 2,
            winrate: 0.5,
        };
        const r = computeFundedStateValue(cfg);
        const exact = exactFundedPolicyValue(cfg, r, depth);
        console.log('PROBE qualified horizon', meanHorizonDays, 'dp', r.initialValue, 'exact', exact, 'bound', r.valueErrorBound);
        expect(1).toBe(1);
    }, 250000);
});
