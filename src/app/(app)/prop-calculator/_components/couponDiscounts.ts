import { type CouponDiscounts, percent } from '~/lib/prop-calculator';

export interface CouponDiscountFields {
    activationDiscountPercent: number;
    evalDiscountPercent: number;
    linkActivationDiscount: boolean;
    monthlySubscriptionDiscountPercent: number;
    resetDiscountPercent: number;
}

export function toCouponDiscounts(
    fields: CouponDiscountFields,
): CouponDiscounts {
    return {
        activationPercent: percent(
            fields.linkActivationDiscount
                ? fields.evalDiscountPercent
                : fields.activationDiscountPercent,
        ),
        evalPercent: percent(fields.evalDiscountPercent),
        monthlySubscriptionPercent: percent(
            fields.monthlySubscriptionDiscountPercent,
        ),
        resetPercent: percent(fields.resetDiscountPercent),
    };
}
