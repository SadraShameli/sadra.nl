import { describe, expect, it } from 'vitest';

import {
    activationFee,
    type CouponDiscounts,
    type FeeSchedule,
    feesUntilPass,
    initialEvalFee,
    rebuyFee,
    retryFee,
    RetryKind,
    retryPath,
    subscriptionFee,
    totalFees,
} from '~/lib/prop-calculator/core';
import { resetFactor } from '~/lib/prop-calculator/core/FeeSchedule';
import { dollars, percent } from '~/lib/prop-calculator/core/lib/units';

const fees: FeeSchedule = {
    activation: dollars(149),
    monthlySubscription: dollars(49),
    oneTimeEval: dollars(0),
    reset: dollars(49),
};

describe('totalFees', () => {
    it('charges a minimum of one month even for a same-day pass', () => {
        expect(totalFees(fees, 0)).toBe(149 + 49);
        expect(totalFees(fees, 1)).toBe(149 + 49);
    });

    it('does not roll into a second month until day 22', () => {
        expect(totalFees(fees, 21)).toBe(149 + 49 * 1);
        expect(totalFees(fees, 22)).toBe(149 + 49 * 2);
    });

    it('scales the monthly subscription linearly with elapsed months', () => {
        expect(totalFees(fees, 42)).toBe(149 + 49 * 2);
        expect(totalFees(fees, 43)).toBe(149 + 49 * 3);
        expect(totalFees(fees, 252)).toBe(149 + 49 * 12);
    });

    it('is invariant to how those days are attributed, only their count', () => {
        expect(totalFees(fees, 6)).toBe(totalFees(fees, 6));
        expect(totalFees(fees, 6)).not.toBe(totalFees(fees, 252));
    });

    it('never charges the monthly subscription for a firm that has none', () => {
        const noSubscription: FeeSchedule = {
            ...fees,
            monthlySubscription: dollars(0),
        };
        expect(totalFees(noSubscription, 21)).toBe(149);
        expect(totalFees(noSubscription, 252)).toBe(149);
        expect(totalFees(noSubscription, 5000)).toBe(149);
    });

    it('applies activation/eval discounts and leaves the monthly subscription untouched when no monthly discount is given', () => {
        const discounted = totalFees(fees, 21, {
            activationPercent: percent(50),
            evalPercent: percent(100),
        });
        expect(discounted).toBe(149 * 0.5 + 0 + 49);
    });

    it('applies a monthly-subscription discount when one is given, on top of activation/eval discounts', () => {
        const discounted = totalFees(fees, 42, {
            activationPercent: percent(50),
            evalPercent: percent(0),
            monthlySubscriptionPercent: percent(40),
        });
        expect(discounted).toBe(149 * 0.5 + 0 + 49 * 0.6 * 2);
    });

    it('a monthly discount alone, with no activation/eval discount, only reduces the subscription line', () => {
        const discounted = totalFees(fees, 21, {
            activationPercent: percent(0),
            evalPercent: percent(0),
            monthlySubscriptionPercent: percent(40),
        });
        expect(discounted).toBe(149 + 0 + 49 * 0.6);
    });
});

describe('feesUntilPass', () => {
    it('excludes the activation fee, unlike totalFees', () => {
        expect(feesUntilPass(fees, 21)).toBe(49);
        expect(totalFees(fees, 21)).toBe(feesUntilPass(fees, 21) + 149);
    });

    it('matches totalFees month-rounding behavior', () => {
        expect(feesUntilPass(fees, 22)).toBe(49 * 2);
    });
});

describe('resetFactor', () => {
    it('is 1 (no discount) when discounts are undefined or resetPercent is unset', () => {
        expect(resetFactor(undefined)).toBe(1);
        expect(
            resetFactor({
                activationPercent: percent(0),
                evalPercent: percent(0),
            }),
        ).toBe(1);
    });

    it('reduces the reset fee by resetPercent', () => {
        expect(
            resetFactor({
                activationPercent: percent(0),
                evalPercent: percent(0),
                resetPercent: percent(40),
            }),
        ).toBe(0.6);
    });
});

function feeSchedule(overrides: Partial<FeeSchedule>): FeeSchedule {
    return {
        activation: dollars(0),
        monthlySubscription: dollars(0),
        oneTimeEval: dollars(0),
        reset: dollars(0),
        ...overrides,
    };
}

const COUPON_AND_BUNDLE: CouponDiscounts = {
    activationPercent: percent(0),
    bundlePercent: percent(5),
    evalPercent: percent(30),
};

describe('retryFee (D1: the cheaper legal retry path)', () => {
    it('keeps the reset when it is cheaper than a re-buy (Lucid-like)', () => {
        const fees = feeSchedule({
            oneTimeEval: dollars(165),
            reset: dollars(115),
        });
        expect(retryFee(fees)).toBe(115);
        expect(retryPath(fees)).toBe(RetryKind.Reset);
    });

    it('re-buys when the reset costs more than a fresh eval (FundedNext Rapid-like)', () => {
        const fees = feeSchedule({
            oneTimeEval: dollars(169.99),
            reset: dollars(174.99),
        });
        expect(retryFee(fees)).toBeCloseTo(169.99, 9);
        expect(retryPath(fees)).toBe(RetryKind.Rebuy);
    });

    it('prices a subscription re-buy as the eval plus one month (TopStep-like)', () => {
        const fees = feeSchedule({
            monthlySubscription: dollars(49),
            reset: dollars(49),
        });
        expect(rebuyFee(fees)).toBe(49);
        expect(retryFee(fees)).toBe(49);
    });

    it('keeps a reset below one month of subscription (FTMO Growth-like)', () => {
        const fees = feeSchedule({
            monthlySubscription: dollars(119),
            reset: dollars(109),
        });
        expect(retryFee(fees)).toBe(109);
    });

    it('applies the reset coupon to the reset side and the eval coupon to the re-buy side', () => {
        const fees = feeSchedule({
            oneTimeEval: dollars(200),
            reset: dollars(100),
        });
        expect(
            retryFee(fees, {
                activationPercent: percent(0),
                evalPercent: percent(0),
                resetPercent: percent(40),
            }),
        ).toBeCloseTo(60, 9);
        expect(
            retryFee(fees, {
                activationPercent: percent(0),
                evalPercent: percent(75),
            }),
        ).toBeCloseTo(50, 9);
    });

    it('always re-buys a plan that sells no reset, whatever its reset field holds', () => {
        const fees = feeSchedule({
            oneTimeEval: dollars(153),
            reset: dollars(0),
            retry: RetryKind.Rebuy,
        });
        expect(retryFee(fees)).toBe(153);
        expect(retryPath(fees)).toBe(RetryKind.Rebuy);
    });

    it('never applies the bundle discount to a retry', () => {
        const fees = feeSchedule({
            oneTimeEval: dollars(165),
            reset: dollars(500),
        });
        expect(retryFee(fees, COUPON_AND_BUNDLE)).toBeCloseTo(115.5, 9);
    });
});

describe('purchase fee primitives', () => {
    it('stacks the bundle and the eval coupon multiplicatively on the initial eval', () => {
        const fees = feeSchedule({ oneTimeEval: dollars(165) });
        expect(initialEvalFee(fees, COUPON_AND_BUNDLE)).toBeCloseTo(109.725, 9);
        expect(initialEvalFee(fees)).toBe(165);
    });

    it('prices a re-buy at the coupon price without the bundle', () => {
        const fees = feeSchedule({ oneTimeEval: dollars(165) });
        expect(rebuyFee(fees, COUPON_AND_BUNDLE)).toBeCloseTo(115.5, 9);
    });

    it('applies the activation coupon and the bundle to the activation fee', () => {
        const fees = feeSchedule({ activation: dollars(100) });
        expect(
            activationFee(fees, {
                activationPercent: percent(50),
                bundlePercent: percent(10),
                evalPercent: percent(0),
            }),
        ).toBeCloseTo(45, 9);
    });

    it('honours the monthly coupon on the subscription and bills at least one month', () => {
        const fees = feeSchedule({ monthlySubscription: dollars(49) });
        const coupon: CouponDiscounts = {
            activationPercent: percent(0),
            evalPercent: percent(0),
            monthlySubscriptionPercent: percent(50),
        };
        expect(subscriptionFee(fees, 22, coupon)).toBeCloseTo(49, 9);
        expect(subscriptionFee(fees, 0)).toBe(49);
    });

    it('feesUntilPass and totalFees are the sum of the primitives', () => {
        const fees = feeSchedule({
            activation: dollars(149),
            monthlySubscription: dollars(49),
            oneTimeEval: dollars(99),
        });
        expect(feesUntilPass(fees, 30, COUPON_AND_BUNDLE)).toBeCloseTo(
            initialEvalFee(fees, COUPON_AND_BUNDLE) +
                subscriptionFee(fees, 30, COUPON_AND_BUNDLE),
            9,
        );
        expect(totalFees(fees, 30, COUPON_AND_BUNDLE)).toBeCloseTo(
            feesUntilPass(fees, 30, COUPON_AND_BUNDLE) +
                activationFee(fees, COUPON_AND_BUNDLE),
            9,
        );
    });
});
