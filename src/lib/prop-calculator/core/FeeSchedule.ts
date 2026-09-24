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
    undiscountableEval?: Dollars;
    undiscountableReset?: Dollars;
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

export function feesUntilPassAcrossAttempts(
    fees: FeeSchedule,
    attemptDays: readonly number[],
    discounts?: CouponDiscounts,
): number {
    if (retryPath(fees, discounts) === RetryKind.Reset) {
        const chainDays = attemptDays.reduce((sum, days) => sum + days, 0);
        return feesUntilPass(fees, chainDays, discounts);
    }
    const [firstAttemptDays = 0, ...rebuyAttemptDays] = attemptDays;
    return rebuyAttemptDays.reduce(
        (total, days) =>
            total + rebuyAttemptSubscriptionFee(fees, days, discounts),
        feesUntilPass(fees, firstAttemptDays, discounts),
    );
}

export function initialEvalFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return discountedCheckout(
        fees.oneTimeEval,
        undiscountableEval(fees),
        evalFactor(discounts) * bundleFactor(discounts),
    );
}

export function monthlySubscriptionFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return fees.monthlySubscription * monthlySubscriptionFactor(discounts);
}

export function rebuyAttemptSubscriptionFee(
    fees: FeeSchedule,
    attemptDays: number,
    discounts?: CouponDiscounts,
): number {
    return (
        subscriptionFee(fees, attemptDays, discounts) -
        monthlySubscriptionFee(fees, discounts)
    );
}

export function rebuyFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return (
        discountedCheckout(
            fees.oneTimeEval,
            undiscountableEval(fees),
            evalFactor(discounts),
        ) + monthlySubscriptionFee(fees, discounts)
    );
}

export function resetFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.resetPercent ?? 0) / 100;
}

export function resetFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return discountedCheckout(
        fees.reset,
        undiscountableReset(fees),
        resetFactor(discounts),
    );
}

export function retryFee(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): number {
    return retryPath(fees, discounts) === RetryKind.Rebuy
        ? rebuyFee(fees, discounts)
        : resetFee(fees, discounts);
}

export function retryPath(
    fees: FeeSchedule,
    discounts?: CouponDiscounts,
): RetryKind {
    if (fees.retry === RetryKind.Rebuy) return RetryKind.Rebuy;
    return rebuyFee(fees, discounts) < resetFee(fees, discounts)
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

function discountedCheckout(
    checkoutPrice: number,
    undiscountable: number,
    factor: number,
): number {
    return Math.max(
        0,
        (checkoutPrice - undiscountable) * factor + undiscountable,
    );
}

function evalFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.evalPercent ?? 0) / 100;
}

function monthlySubscriptionFactor(
    discounts: CouponDiscounts | undefined,
): number {
    return 1 - (discounts?.monthlySubscriptionPercent ?? 0) / 100;
}

function undiscountableEval(fees: FeeSchedule): number {
    return fees.undiscountableEval ?? 0;
}

function undiscountableReset(fees: FeeSchedule): number {
    return fees.undiscountableReset ?? 0;
}
