import { describe, expect, it } from 'vitest';

import {
    activationFee,
    type CouponDiscounts,
    dollars,
    type FeeSchedule,
    feesUntilPass,
    feesUntilPassAcrossAttempts,
    initialEvalFee,
    percent,
    rebuyAttemptSubscriptionFee,
    rebuyFee,
    resetFactor,
    resetFee,
    retryFee,
    RetryKind,
    retryPath,
    subscriptionFee,
    totalFees,
} from '~/lib/prop-calculator/core';

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

describe('subscription billing across eval attempts (N-60)', () => {
    const MONTHLY_COUPON: CouponDiscounts = {
        activationPercent: percent(0),
        evalPercent: percent(0),
        monthlySubscriptionPercent: percent(50),
    };

    it('a re-bought attempt bills only the months past the first, which its re-buy price already holds', () => {
        const fees = feeSchedule({ monthlySubscription: dollars(100) });
        expect(rebuyAttemptSubscriptionFee(fees, 0)).toBe(0);
        expect(rebuyAttemptSubscriptionFee(fees, 21)).toBe(0);
        expect(rebuyAttemptSubscriptionFee(fees, 22)).toBe(100);
        expect(rebuyAttemptSubscriptionFee(fees, 43, MONTHLY_COUPON)).toBe(100);
    });

    it('a reset chain bills the first eval and the calendar months of the summed attempt days', () => {
        const fees = feeSchedule({
            monthlySubscription: dollars(100),
            oneTimeEval: dollars(30),
            reset: dollars(40),
        });
        expect(feesUntilPassAcrossAttempts(fees, [10, 10, 10])).toBe(30 + 200);
        expect(feesUntilPassAcrossAttempts(fees, [10, 10, 10])).toBe(
            feesUntilPass(fees, 30),
        );
    });

    it('a re-buy chain bills the first account in full and each re-bought account only past its first month', () => {
        const fees = feeSchedule({
            monthlySubscription: dollars(100),
            oneTimeEval: dollars(30),
            reset: dollars(1000),
        });
        expect(feesUntilPassAcrossAttempts(fees, [10, 10, 10])).toBe(30 + 100);
        expect(feesUntilPassAcrossAttempts(fees, [25, 10, 43])).toBe(
            30 + 200 + 0 + 200,
        );
        expect(
            feesUntilPassAcrossAttempts(fees, [10, 10, 10]) +
                2 * rebuyFee(fees),
        ).toBe(3 * (30 + 100));
    });

    it('honours the monthly coupon and the bundle on a re-buy chain', () => {
        const fees = feeSchedule({
            monthlySubscription: dollars(100),
            oneTimeEval: dollars(165),
            reset: dollars(1000),
            retry: RetryKind.Rebuy,
        });
        expect(
            feesUntilPassAcrossAttempts(fees, [30, 22], {
                ...COUPON_AND_BUNDLE,
                monthlySubscriptionPercent: percent(50),
            }),
        ).toBeCloseTo(109.725 + 50 * 2 + 50, 9);
    });

    it('a chain with no recorded attempt bills one month, like a same-day pass', () => {
        const rebuy = feeSchedule({
            monthlySubscription: dollars(100),
            retry: RetryKind.Rebuy,
        });
        const reset = feeSchedule({
            monthlySubscription: dollars(100),
            reset: dollars(40),
        });
        expect(feesUntilPassAcrossAttempts(rebuy, [])).toBe(100);
        expect(feesUntilPassAcrossAttempts(reset, [])).toBe(100);
    });
});

describe('an undiscountable eval component stays outside every percentage discount (N-52)', () => {
    const coupon30: CouponDiscounts = {
        activationPercent: percent(0),
        evalPercent: percent(30),
    };
    const dllOffFees: FeeSchedule = {
        activation: dollars(0),
        monthlySubscription: dollars(0),
        oneTimeEval: dollars(192),
        reset: dollars(140),
        undiscountableEval: dollars(20),
    };
    const dllOnFees: FeeSchedule = {
        ...dllOffFees,
        oneTimeEval: dollars(167),
        reset: dollars(115),
        undiscountableEval: dollars(-5),
    };

    it('charges the full checkout price with no discount', () => {
        expect(initialEvalFee(dllOffFees)).toBe(192);
        expect(initialEvalFee(dllOnFees)).toBe(167);
    });

    it('discounts only the list price: an add-on is charged in full, a promo is taken in full', () => {
        expect(initialEvalFee(dllOffFees, coupon30)).toBeCloseTo(
            172 * 0.7 + 20,
            9,
        );
        expect(initialEvalFee(dllOnFees, coupon30)).toBeCloseTo(
            172 * 0.7 - 5,
            9,
        );
    });

    it('keeps the bundle off the undiscountable component too', () => {
        expect(
            initialEvalFee(dllOffFees, {
                ...coupon30,
                bundlePercent: percent(10),
            }),
        ).toBeCloseTo(172 * 0.7 * 0.9 + 20, 9);
    });

    it('prices a re-buy the same way', () => {
        expect(rebuyFee(dllOffFees, coupon30)).toBeCloseTo(172 * 0.7 + 20, 9);
        expect(rebuyFee(dllOnFees, coupon30)).toBeCloseTo(172 * 0.7 - 5, 9);
    });

    it('leaves a plan with no undiscountable component unchanged', () => {
        const plain: FeeSchedule = {
            ...dllOffFees,
            undiscountableEval: undefined,
        };
        expect(initialEvalFee(plain, coupon30)).toBeCloseTo(192 * 0.7, 9);
        expect(rebuyFee(plain, coupon30)).toBeCloseTo(192 * 0.7, 9);
    });
});

describe('a discounted checkout never goes below $0 (N-52 review)', () => {
    const dllOnFees: FeeSchedule = {
        activation: dollars(0),
        monthlySubscription: dollars(0),
        oneTimeEval: dollars(167),
        reset: dollars(115),
        undiscountableEval: dollars(-5),
        undiscountableReset: dollars(-5),
    };
    const fullCoupon: CouponDiscounts = {
        activationPercent: percent(0),
        evalPercent: percent(100),
        resetPercent: percent(100),
    };

    it('charges $0, not -$5, for an eval or a re-buy at 100% off with a $5 promo', () => {
        expect(initialEvalFee(dllOnFees, fullCoupon)).toBe(0);
        expect(rebuyFee(dllOnFees, fullCoupon)).toBe(0);
    });

    it('still adds the monthly subscription on top of a $0 re-buy', () => {
        expect(
            rebuyFee(
                { ...dllOnFees, monthlySubscription: dollars(49) },
                fullCoupon,
            ),
        ).toBe(49);
    });

    it('charges $0, not -$5, for a reset at 100% off with a $5 promo', () => {
        expect(resetFee(dllOnFees, fullCoupon)).toBe(0);
        expect(retryFee(dllOnFees, fullCoupon)).toBe(0);
    });
});

describe('an undiscountable reset component stays outside the reset coupon (N-52 review)', () => {
    const dllOffFees: FeeSchedule = {
        activation: dollars(0),
        monthlySubscription: dollars(0),
        oneTimeEval: dollars(192),
        reset: dollars(140),
        undiscountableEval: dollars(20),
        undiscountableReset: dollars(20),
    };
    const dllOnFees: FeeSchedule = {
        ...dllOffFees,
        oneTimeEval: dollars(167),
        reset: dollars(115),
        undiscountableEval: dollars(-5),
        undiscountableReset: dollars(-5),
    };
    const resetCoupon30: CouponDiscounts = {
        activationPercent: percent(0),
        evalPercent: percent(0),
        resetPercent: percent(30),
    };

    it('charges the full reset checkout price with no discount', () => {
        expect(resetFee(dllOffFees)).toBe(140);
        expect(resetFee(dllOnFees)).toBe(115);
    });

    it('discounts only the reset list price: the add-on is charged in full, the promo is taken in full', () => {
        expect(resetFee(dllOffFees, resetCoupon30)).toBeCloseTo(
            120 * 0.7 + 20,
            9,
        );
        expect(resetFee(dllOnFees, resetCoupon30)).toBeCloseTo(
            120 * 0.7 - 5,
            9,
        );
    });

    it('prices the reset retry and the reset-vs-rebuy choice from the same reset fee', () => {
        expect(retryPath(dllOffFees, resetCoupon30)).toBe(RetryKind.Reset);
        expect(retryFee(dllOffFees, resetCoupon30)).toBeCloseTo(
            120 * 0.7 + 20,
            9,
        );
    });

    it('picks the re-buy once the undiscountable add-on keeps the reset above it', () => {
        const nearTie: FeeSchedule = {
            ...dllOffFees,
            oneTimeEval: dollars(93),
            reset: dollars(120),
            undiscountableEval: dollars(0),
            undiscountableReset: dollars(20),
        };
        const coupon: CouponDiscounts = {
            activationPercent: percent(0),
            evalPercent: percent(0),
            resetPercent: percent(25),
        };
        expect(resetFee(nearTie, coupon)).toBeCloseTo(100 * 0.75 + 20, 9);
        expect(retryPath(nearTie, coupon)).toBe(RetryKind.Rebuy);
        expect(retryFee(nearTie, coupon)).toBe(93);
    });

    it('leaves a plan with no undiscountable reset unchanged', () => {
        const plain: FeeSchedule = {
            ...dllOffFees,
            undiscountableReset: undefined,
        };
        expect(resetFee(plain, resetCoupon30)).toBeCloseTo(140 * 0.7, 9);
    });
});
