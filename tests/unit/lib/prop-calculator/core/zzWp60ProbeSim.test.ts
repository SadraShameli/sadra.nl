import { describe, expect, it } from 'vitest';

import { dollars, simulate } from '~/lib/prop-calculator';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';

import {
    alphaToy,
    lossExemptRuleOf,
    qualifiedAlphaRule,
} from '../firms/alphafutures/alphaConsistencyFixtures';

describe('probe', () => {
    it.each(['qualified', 'lossExempt'])(
        'alpha toy %s',
        (which) => {
            const q = qualifiedAlphaRule();
            const rule = which === 'qualified' ? q : lossExemptRuleOf(q);
            const cpu0 = process.cpuUsage();
            const result = computeFundedStateValue({
                actionStepMultiple: 0.5,
                cushionStepMultiple: 0.25,
                cycleBestDayBucketCount: 10,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                maxTailCushionMultiple: 6,
                plan: alphaToy(rule),
                rrRatio: 2,
                tradesPerDay: 2,
                winrate: 0.5,
            });
            const cpu1 = process.cpuUsage(cpu0);
            const out = simulate({
                fundedDayPolicy: result.dayPolicy,
                fundedHorizonDays: 400,
                maxEvalDays: 1,
                plan: alphaToy(rule),
                riskPerTrade: 100,
                rrRatio: 2,
                seed: 7,
                tradesPerDay: 2,
                trials: 10_000,
                winrate: 0.5,
            });
            const cpu2 = process.cpuUsage(cpu0);
            console.log(
                'PROBE alphaSim',
                which,
                'solveCpuMs',
                Math.round((cpu1.user + cpu1.system) / 1000),
                'totalCpuMs',
                Math.round((cpu2.user + cpu2.system) / 1000),
                'dp',
                result.initialValue,
                'states',
                result.reachedStateCount,
                'sweeps',
                result.sweepCount,
                'sim',
                out.expectedGrossPayout,
                'bust',
                out.fundedBustProbability,
                'payouts',
                out.expectedPayoutCount,
            );
            expect(1).toBe(1);
        },
        200_000,
    );
});
