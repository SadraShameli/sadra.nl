import { describe, expect, it } from 'vitest';

import { FirmId, MffuVariant } from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

function builder() {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFFU Builder 50K plan not found');
    return plan;
}

describe('MFFU Builder 50K (live-verified 2026-09-10 against help.myfundedfutures.com)', () => {
    it('closes both the evaluation and funded account after 7 consecutive days without a trade', () => {
        expect(builder().maxConsecutiveIdleDays).toBe(7);
    });

    it(
        'caps sim-funded payouts at 5 lifetime, matching the real "graduate to a ' +
            'live account after your 5th approved payout" rule (the live-account ' +
            'phase itself is a distinct, unmodeled product and out of scope)',
        () => {
            expect(builder().maxLifetimePayouts).toBe(5);
        },
    );
});
