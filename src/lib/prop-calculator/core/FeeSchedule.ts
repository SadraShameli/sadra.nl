import { TRADING_DAYS_PER_MONTH } from './constants';
import { type Dollars, type Percent0to100 } from './lib/units';

export enum RetryKind {
    Rebuy = 'rebuy',
    Reset = 'reset',
}

export interface CouponDiscounts {
    activationPercent: Percent0to100;
    bundlePercent?: Percent0to100;
    evalPercent: Percent0to100;
    monthlySubscriptionPercent?: Percent0to100;
    resetPercent?: Percent0to100;
}

export interface FeeSchedule {
    activation: Dollars;
    monthlySubscription: Dollars;
    oneTimeEval: Dollars;
    reset: Dollars;
    retry?: RetryKind;
}

export function activationFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return (
        fees.activation * activationFactor(discounts) * bundleFactor(discounts)
    );
}

export function feesUntilPass(
    fees: FeeSchedule,
    daysToPass: number,
    discounts?: CouponDiscounts,
): number {
    return (
        initialEvalFee(fees, discounts) +
        subscriptionFee(fees, daysToPass, discounts)
    );
}

export function initialEvalFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return fees.oneTimeEval * evalFactor(discounts) * bundleFactor(discounts);
}

export function monthlySubscriptionFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return fees.monthlySubscription * monthlySubscriptionFactor(discounts);
}

export function rebuyFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return (
        fees.oneTimeEval * evalFactor(discounts) +
        monthlySubscriptionFee(fees, discounts)
    );
}

export function resetFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.resetPercent ?? 0) / 100;
}

export function retryFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return retryPath(fees, discounts) === RetryKind.Rebuy
        ? rebuyFee(fees, discounts)
        : fees.reset * resetFactor(discounts);
}

export function retryPath(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): RetryKind {
    if (fees.retry === RetryKind.Rebuy) return RetryKind.Rebuy;
    return rebuyFee(fees, discounts) < fees.reset * resetFactor(discounts)
        ? RetryKind.Rebuy
        : RetryKind.Reset;
}

export function subscriptionFee(
    fees: FeeSchedule,
    billedDays: number,
    discounts?: CouponDiscounts,
): number {
    const months = Math.max(1, Math.ceil(billedDays / TRADING_DAYS_PER_MONTH));
    return monthlySubscriptionFee(fees, discounts) * months;
}

export function totalFees(
    fees: FeeSchedule,
    totalDays: number,
    discounts?: CouponDiscounts,
): number {
    return (
        feesUntilPass(fees, totalDays, discounts) +
        activationFee(fees, discounts)
    );
}

function activationFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.activationPercent ?? 0) / 100;
}

function bundleFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.bundlePercent ?? 0) / 100;
}

function evalFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.evalPercent ?? 0) / 100;
}

function monthlySubscriptionFactor(
    discounts: CouponDiscounts | undefined,
): number {
    return 1 - (discounts?.monthlySubscriptionPercent ?? 0) / 100;
}
