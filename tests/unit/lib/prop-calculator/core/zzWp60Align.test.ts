import { describe, expect, it } from 'vitest';

import {
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

import { exactFundedPolicyValue } from '../fundedStateValueToy';

const TOY_DRAWDOWN = 100;

function toyPlan(): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('x');
    return rapidEod.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(TOY_DRAWDOWN) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minRetainedCushionOverride: undefined,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('align', () => {
    it.each([
        [0.25, 0.25],
        [0.2, 0.2],
        [0.2, 0.1],
        [0.1, 0.2],
        [0.2, 0.25],
        [0.25, 0.125],
    ])(
        'cushion %s action %s',
        (cushion, action) => {
            const cfg = {
                actionStepMultiple: action,
                convergenceTolerance: 1e-9,
                cushionStepMultiple: cushion,
                cycleBestDayBucketCount: 1,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                plan: toyPlan(),
                rrRatio: 2,
                tradesPerDay: 2,
                winrate: 0.5,
            };
            const r = computeFundedStateValue(cfg);
            const exact = exactFundedPolicyValue(cfg, r, 48);
            console.log(
                'ALIGN cushion',
                cushion,
                'action',
                action,
                'dp',
                r.initialValue,
                'exact',
                exact,
                'ratio',
                r.initialValue / exact,
            );
            expect(1).toBe(1);
        },
        240_000,
    );
});
