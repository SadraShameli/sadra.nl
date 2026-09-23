import { formatCompactCurrency } from '~/lib/format';
import {
    type CouponDiscounts,
    type FeeSchedule,
    rebuyFee,
    retryFee,
    RetryKind,
    retryPath,
} from '~/lib/prop-calculator';

export function describeResetFee(
    fees: FeeSchedule,
    resetDiscountPercent: number,
): string {
    if (fees.retry === RetryKind.Rebuy) {
        return `no reset, re-buy at ${formatCompactCurrency(rebuyFee(fees))}`;
    }
    if (fees.reset <= 0) return 'no reset fee';
    return resetDiscountPercent > 0
        ? `${formatCompactCurrency(fees.reset)} → ${formatCompactCurrency(fees.reset * (1 - resetDiscountPercent / 100))}`
        : formatCompactCurrency(fees.reset);
}

export function describeRetryOnBust(
    fees: FeeSchedule,
    discounts: CouponDiscounts | undefined,
    maxAttempts: number,
): null | string {
    const retries = maxAttempts - 1;
    const fee = retryFee(fees, discounts);
    if (retries < 1 || fee <= 0) return null;
    const noun = retryNoun(retryPath(fees, discounts), retries);
    return `Up to ${retries} ${noun} at ${formatCompactCurrency(fee)} each on bust.`;
}

export function hasResetOption(fees: FeeSchedule): boolean {
    return fees.retry !== RetryKind.Rebuy && fees.reset > 0;
}

function retryNoun(kind: RetryKind, count: number): string {
    const singular = kind === RetryKind.Rebuy ? 're-buy' : 'reset';
    return count === 1 ? singular : `${singular}s`;
}
