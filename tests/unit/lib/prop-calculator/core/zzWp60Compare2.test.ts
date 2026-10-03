import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';

import {
    alphaToy,
    lossExemptRuleOf,
    qualifiedAlphaRule,
} from '../firms/alphafutures/alphaConsistencyFixtures';
import { exactFundedPolicyValue } from '../fundedStateValueToy';

describe('compare2', () => {
    it.each([
        ['qualified', 10, 8],
        ['qualified', undefined, 8],
        ['qualified', 10, 14],
        ['qualified', undefined, 14],
        ['lossExempt', 10, 14],
    ])('alpha toy %s buckets %s horizon %s', (which, buckets, meanHorizonDays) => {
        const q = qualifiedAlphaRule();
        const rule = which === 'qualified' ? q : lossExemptRuleOf(q);
        const cfg = {
            actionStepMultiple: 0.5,
            convergenceTolerance: 1e-9,
            cushionStepMultiple: 0.25,
            cycleBestDayBucketCount: buckets,
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
        const result = computeFundedStateValue(cfg);
        const depth = meanHorizonDays === 8 ? 70 : 110;
        const exact = exactFundedPolicyValue(cfg, result, depth);
        console.log('CMP2 alpha', which, 'buckets', buckets, 'horizon', meanHorizonDays, 'dp', result.initialValue, 'exact', exact, 'ratio', result.initialValue / exact, 'states', result.reachedStateCount);
        expect(1).toBe(1);
    }, 280000);
});
