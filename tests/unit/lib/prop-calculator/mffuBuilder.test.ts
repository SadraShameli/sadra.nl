import { describe, expect, it } from 'vitest';

import {
    FirmId,
    MffuVariant,
    percent,
    RetryKind,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

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

    it('charges the full $153 evaluation fee on reset, since Builder has no reset option and a breach means buying a new evaluation', () => {
        const plan = builder();
        expect(plan.fees.oneTimeEval).toBe(153);
        expect(plan.fees.reset).toBe(153);
        expect(plan.fees.reset).toBe(plan.fees.oneTimeEval);
    });

    it('accrues one full $153 evaluation fee per failed attempt in a multi-attempt trial', () => {
        const out = simulate({
            fundedHorizonDays: 10,
            maxAttempts: 3,
            maxEvalDays: 5,
            plan: builder(),
            riskPerTrade: 2100,
            rrRatio: 1,
            seed: 9,
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });

        expect(out.bustProbability).toBe(1);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * 153);
    });

    it('models the retry as a re-buy, so a reset-only coupon cannot lower it below the $153 evaluation price', () => {
        const plan = builder();
        expect(plan.fees.retry).toBe(RetryKind.Rebuy);
        expect(
            plan.retryFee({
                activationPercent: percent(0),
                evalPercent: percent(0),
                resetPercent: percent(50),
            }),
        ).toBe(153);
    });
});
