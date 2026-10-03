import { describe, expect, it } from 'vitest';

import {
    FirmId,
    type FundedCycleSnapshot,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

function fundedCycleAfter(payoutsIssued: number): FundedCycleSnapshot {
    return {
        cycleBestDayProfit: 0,
        dayGateProgress: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: 0,
        payoutsIssued,
    };
}

describe('debug', () => {
    it('locked policy', () => {
        const plan = new MyFundedFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        })!;
        const result = computeFundedStateValue({
            actionStepMultiple: 0.1,
            evalInitialValue: 20_000,
            feePerAttempt: plan.fees.reset,
            maxActionMultiple: 0.3,
            plan,
            rrRatio: 2,
            tradesPerDay: 4,
            winrate: 0.4,
        });
        console.log('DBG value', result.initialValue, result.reachedStateCount);
        for (const balance of [
            51_300, 52_400, 52_500, 52_600, 52_700, 52_800, 54_100,
        ]) {
            for (const payouts of [0, 1, 2]) {
                const locked = plan.initialState();
                locked.balance = balance;
                locked.threshold = 50_100;
                locked.thresholdLocked = true;
                const risks = [0, 1, 2, 3].map((i) =>
                    result.dayPolicy.computeRisk?.(
                        locked,
                        i,
                        fundedCycleAfter(payouts),
                    ),
                );
                console.log(
                    'DBG locked',
                    balance,
                    'payouts',
                    payouts,
                    JSON.stringify(risks),
                );
            }
        }
        expect(1).toBe(1);
    }, 120_000);
});
