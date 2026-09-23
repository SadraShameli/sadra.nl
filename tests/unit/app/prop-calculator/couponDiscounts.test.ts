import { describe, expect, it } from 'vitest';

import { toCouponDiscounts } from '~/app/(app)/prop-calculator/_components/couponDiscounts';

const FIELDS = {
    activationDiscountPercent: 10,
    evalDiscountPercent: 40,
    linkActivationDiscount: false,
    monthlySubscriptionDiscountPercent: 25,
    resetDiscountPercent: 15,
};

describe('toCouponDiscounts (one web mapping from coupon form fields)', () => {
    it('maps every coupon field to its CouponDiscounts percent', () => {
        expect(toCouponDiscounts(FIELDS)).toStrictEqual({
            activationPercent: 10,
            evalPercent: 40,
            monthlySubscriptionPercent: 25,
            resetPercent: 15,
        });
    });

    it('uses the eval coupon for the activation when the two are linked', () => {
        expect(
            toCouponDiscounts({ ...FIELDS, linkActivationDiscount: true })
                .activationPercent,
        ).toBe(40);
    });
});
