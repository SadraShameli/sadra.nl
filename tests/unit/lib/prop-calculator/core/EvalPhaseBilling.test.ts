import { describe, expect, it } from 'vitest';

import {
    dollars,
    evalAttemptDays,
    evalPhaseCost,
    type FeeSchedule,
    percent,
    RetryKind,
} from '~/lib/prop-calculator/core';

const RESET_PLAN: FeeSchedule = {
    activation: dollars(80),
    monthlySubscription: dollars(0),
    oneTimeEval: dollars(100),
    reset: dollars(50),
};

const SUBSCRIPTION_REBUY_PLAN: FeeSchedule = {
    activation: dollars(0),
    monthlySubscription: dollars(100),
    oneTimeEval: dollars(30),
    reset: dollars(0),
    retry: RetryKind.Rebuy,
};

describe('one shared eval-phase billing helper (WP22b DRY, N-60)', () => {
    it('lists every failed attempt and then the passing one', () => {
        expect(
            evalAttemptDays({ daysToPass: 7, failedAttemptDays: [10, 5] }),
        ).toStrictEqual([10, 5, 7]);
        expect(
            evalAttemptDays({ daysToPass: null, failedAttemptDays: [10, 5] }),
        ).toStrictEqual([10, 5]);
        expect(
            evalAttemptDays({ daysToPass: 3, failedAttemptDays: [] }),
        ).toStrictEqual([3]);
    });

    it('bills the eval, the resets and the activation once on a pass', () => {
        expect(
            evalPhaseCost(
                RESET_PLAN,
                { daysToPass: 5, failedAttemptDays: [10], resetFeesPaid: 50 },
                undefined,
            ),
        ).toBe(100 + 50 + 80);
    });

    it('never bills the activation when the eval is not passed', () => {
        expect(
            evalPhaseCost(
                RESET_PLAN,
                {
                    daysToPass: null,
                    failedAttemptDays: [10, 12],
                    resetFeesPaid: 50,
                },
                undefined,
            ),
        ).toBe(100 + 50);
    });

    it('bills a re-bought account only the months past the first its re-buy price holds (T10)', () => {
        const firstAccount = 30 + 100 * 2;
        const rebuyPrice = 30 + 100;
        expect(
            evalPhaseCost(
                SUBSCRIPTION_REBUY_PLAN,
                {
                    daysToPass: 10,
                    failedAttemptDays: [25],
                    resetFeesPaid: rebuyPrice,
                },
                undefined,
            ),
        ).toBe(firstAccount + rebuyPrice);
    });

    it('applies the same coupon and bundle discounts as the fee primitives', () => {
        expect(
            evalPhaseCost(
                RESET_PLAN,
                { daysToPass: 5, failedAttemptDays: [], resetFeesPaid: 0 },
                {
                    activationPercent: percent(50),
                    bundlePercent: percent(10),
                    evalPercent: percent(20),
                },
            ),
        ).toBeCloseTo(100 * 0.8 * 0.9 + 80 * 0.5 * 0.9, 10);
    });
});
