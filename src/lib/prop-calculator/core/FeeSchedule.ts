export interface FeeSchedule {
    oneTimeEval: number;
    activation: number;
    monthlySubscription: number;
    reset: number;
}

export interface CouponDiscounts {
    evalPercent: number;
    activationPercent: number;
}

const TRADING_DAYS_PER_MONTH = 21;

function evalFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.evalPercent ?? 0) / 100;
}

function activationFactor(discounts: CouponDiscounts | undefined): number {
    return 1 - (discounts?.activationPercent ?? 0) / 100;
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
