import { TRADING_DAYS_PER_MONTH } from './constants';
import { type Dollars, type Percent0to100 } from './units';

export interface CouponDiscounts {
    activationPercent: Percent0to100;
    evalPercent: Percent0to100;
}

export interface FeeSchedule {
    activation: Dollars;
    monthlySubscription: Dollars;
    oneTimeEval: Dollars;
    reset: Dollars;
}

export function feesUntilPass(
    fees: FeeSchedule,
    daysToPass: number,
    discounts?: CouponDiscounts,
): number {
    const months = Math.max(1, Math.ceil(daysToPass / TRADING_DAYS_PER_MONTH));
    return (
        fees.oneTimeEval * evalFactor(discounts) +
        fees.monthlySubscription * months
    );
}

export function totalFees(
    fees: FeeSchedule,
    totalDays: number,
    discounts?: CouponDiscounts,
): number {
    const months = Math.max(1, Math.ceil(totalDays / TRADING_DAYS_PER_MONTH));
    return (
        fees.oneTimeEval * evalFactor(discounts) +
        fees.activation * activationFactor(discounts) +
        fees.monthlySubscription * months
    );
}

function activationFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.activationPercent ?? 0) / 100;
}

function evalFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.evalPercent ?? 0) / 100;
}
