import { describe, expect, it } from 'vitest';

import {
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

import { exactFundedPolicyValue } from '../fundedStateValueToy';

function consistencyToyPlan(): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('x');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4)),
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 2,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('probe', () => {
    it.each([1, undefined])(
        'bucketcount %s',
        (bucketCount) => {
            const cfg = {
                actionStepMultiple: 1,
                convergenceTolerance: 1e-9,
                cushionStepMultiple: 0.5,
                cycleBestDayBucketCount: bucketCount,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                maxCushionMultiple: 6,
                maxTailCushionMultiple: 12,
                meanHorizonDays: 3,
                plan: consistencyToyPlan(),
                rrRatio: 2,
                tradesPerDay: 2,
                winrate: 0.5,
            };
            const r = computeFundedStateValue(cfg);
            const exact = exactFundedPolicyValue(cfg, r, 14);
            const out = simulate({
                fundedDayPolicy: r.dayPolicy,
                fundedHorizonDays: 200,
                maxEvalDays: 1,
                plan: cfg.plan,
                riskPerTrade: 100,
                rrRatio: 2,
                seed: 7,
                tradesPerDay: 2,
                trials: 20_000,
                winrate: 0.5,
            });
            console.log(
                'PROBE single',
                bucketCount,
                'dp',
                r.initialValue,
                'exact',
                exact,
                'sim',
                out.expectedGrossPayout,
                'payouts',
                out.expectedPayoutCount,
                'states',
                r.reachedStateCount,
            );
            expect(1).toBe(1);
        },
        200_000,
    );

    it.each([1, undefined])(
        'testconfig bucketcount %s',
        (bucketCount) => {
            const r = computeFundedStateValue({
                actionStepMultiple: 1,
                convergenceTolerance: 0.01,
                cushionStepMultiple: 0.5,
                cycleBestDayBucketCount: bucketCount,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                maxCushionMultiple: 6,
                maxTailCushionMultiple: 12,
                plan: consistencyToyPlan(),
                rrRatio: 2,
                tradesPerDay: 2,
                winrate: 0.5,
            });
            console.log(
                'PROBE testconfig',
                bucketCount,
                'dp',
                r.initialValue,
                'states',
                r.reachedStateCount,
                'sweeps',
                r.sweepCount,
            );
            expect(1).toBe(1);
        },
        200_000,
    );

    it.each([1, undefined])(
        'exact infinite %s',
        (bucketCount) => {
            const cfg = {
                actionStepMultiple: 1,
                convergenceTolerance: 0.01,
                cushionStepMultiple: 0.5,
                cycleBestDayBucketCount: bucketCount,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                maxCushionMultiple: 6,
                maxTailCushionMultiple: 12,
                plan: consistencyToyPlan(),
                rrRatio: 2,
                tradesPerDay: 2,
                winrate: 0.5,
            };
            const r = computeFundedStateValue(cfg);
            for (const depth of [3, 6, 10, 14]) {
                console.log(
                    'PROBE exactInfinite',
                    bucketCount,
                    'depth',
                    depth,
                    'dp',
                    r.initialValue,
                    'exact',
                    exactFundedPolicyValue(cfg, r, depth),
                );
            }
            const out = simulate({
                fundedDayPolicy: r.dayPolicy,
                fundedHorizonDays: 400,
                maxEvalDays: 1,
                plan: cfg.plan,
                riskPerTrade: 100,
                rrRatio: 2,
                seed: 7,
                tradesPerDay: 2,
                trials: 20_000,
                winrate: 0.5,
            });
            console.log(
                'PROBE simInfinite',
                bucketCount,
                'sim',
                out.expectedGrossPayout,
                'payouts',
                out.expectedPayoutCount,
                'bust',
                out.fundedBustProbability,
            );
            expect(1).toBe(1);
        },
        200_000,
    );
});
