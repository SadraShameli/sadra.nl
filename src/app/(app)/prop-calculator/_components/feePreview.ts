import { formatCompactCurrency } from '~/lib/format';
import {
    activationFee,
    type CouponDiscounts,
    type FeeSchedule,
    initialEvalFee,
    monthlySubscriptionFee,
    type Plan,
} from '~/lib/prop-calculator';

import {
    type CouponDiscountFields,
    toCouponDiscounts,
} from './couponDiscounts';

export function describeActivationFee(
    fees: FeeSchedule,
    discounts: CouponDiscounts | undefined,
): string {
    return fees.activation <= 0
        ? 'no activation fee'
        : describeDiscountedFee(
              fees.activation,
              activationFee(fees, discounts),
          );
}

export function describeDiscountedFee(
    listedPrice: number,
    discountedPrice: number,
): string {
    const listed = formatCompactCurrency(listedPrice);
    const discounted = formatCompactCurrency(discountedPrice);
    return listed === discounted ? listed : `${listed} → ${discounted}`;
}

export function describeEvalFee(
    fees: FeeSchedule,
    discounts: CouponDiscounts | undefined,
): string {
    return fees.oneTimeEval <= 0
        ? 'no eval fee'
        : describeDiscountedFee(
              fees.oneTimeEval,
              initialEvalFee(fees, discounts),
          );
}

export function describeMonthlySubscriptionFee(
    fees: FeeSchedule,
    discounts: CouponDiscounts | undefined,
): string {
    return fees.monthlySubscription <= 0
        ? 'no monthly subscription'
        : describeDiscountedFee(
              fees.monthlySubscription,
              monthlySubscriptionFee(fees, discounts),
          );
}

export function purchaseCouponDiscounts(
    plan: Plan,
    fields: CouponDiscountFields,
    accountCount: number,
): CouponDiscounts | undefined {
    return plan.purchaseDiscounts(toCouponDiscounts(fields), accountCount);
}
