import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    FirmId,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const mffu = new MyFundedFutures();

function pro() {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFFU Pro 50K plan not found');
    return plan;
}

describe('MFFU Pro 50K (live-verified 2026-09-14 against myfundedfutures.com/plans/pro raw page data)', () => {
    it('caps eval contracts at 3, not the funded-only 5, resolving the prior two-source conflict via the raw maxPositionSize/maxPositionSizeFunded JSON fields', () => {
        expect(pro().contractLimits?.evalMinis).toBe(3);
        expect(pro().contractLimits?.evalMicros).toBe(3);
    });

    it('keeps funded contracts flat at 5, unchanged from before', () => {
        const funded = pro().contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded contract limit for MFFU Pro',
            );
        }
        expect(funded.maxContracts).toBe(5);
        const fundedMicros = pro().contractLimits?.fundedMicros;
        if (fundedMicros?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded micro contract limit for MFFU Pro',
            );
        }
        expect(fundedMicros.maxContracts).toBe(5);
    });

    it(
        'requires 14 days after passing before the first payout, not 10 -- ' +
            "matching the live page's own initialWithdrawalDays:14 field and its " +
            "rendered 'Payout Timing: 14 days from first trade + buffer cleared' row",
        () => {
            expect(pro().minDaysAfterPassForPayout).toBe(14);
        },
    );
});
