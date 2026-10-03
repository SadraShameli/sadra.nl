import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';

import {
    alphaToy,
    lossExemptRuleOf,
    qualifiedAlphaRule,
} from '../firms/alphafutures/alphaConsistencyFixtures';
import { exactFundedPolicyValue } from '../fundedStateValueToy';

describe('compare', () => {
    it.each([
        ['qualified', undefined],
        ['qualified', 20],
        ['lossExempt', undefined],
        ['lossExempt', 20],
    ])(
        'alpha toy %s horizon %s',
        (which, meanHorizonDays) => {
            const q = qualifiedAlphaRule();
            const rule = which === 'qualified' ? q : lossExemptRuleOf(q);
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
            const result = computeFundedStateValue(cfg);
            const depths =
                meanHorizonDays === undefined ? [30, 60, 120] : [60, 120];
            const exacts = depths.map(
                (d) =>
                    `${d}:${exactFundedPolicyValue(cfg, result, d).toFixed(3)}`,
            );
            console.log(
                'CMP alpha',
                which,
                'horizon',
                meanHorizonDays,
                'dp',
                result.initialValue,
                'exact',
                exacts.join(' '),
            );
            expect(1).toBe(1);
        },
        280_000,
    );
});
