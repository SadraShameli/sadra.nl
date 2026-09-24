import { formatCompactCurrency } from '~/lib/format';
import {
    type CouponDiscounts,
    type FeeSchedule,
    rebuyFee,
    resetFee,
    retryFee,
    RetryKind,
    retryPath,
} from '~/lib/prop-calculator';

import { describeDiscountedFee } from './feePreview';

export function describeResetFee(
    fees: FeeSchedule,
    discounts: CouponDiscounts | undefined,
): string {
    if (fees.retry === RetryKind.Rebuy) {
        return `no reset, re-buy at ${formatCompactCurrency(rebuyFee(fees, discounts))}`;
    }
    return fees.reset <= 0
        ? 'no reset fee'
        : describeDiscountedFee(fees.reset, resetFee(fees, discounts));
}

export function describeRetry(
    fees: FeeSchedule,
    discounts: CouponDiscounts | undefined,
    maxAttempts: number,
): null | string {
    const retries = maxAttempts - 1;
    const fee = retryFee(fees, discounts);
    if (retries < 1 || fee <= 0) return null;
    const kind = retryPath(fees, discounts);
    return `Up to ${retries} ${retryNoun(kind, retries)} at ${formatCompactCurrency(fee)} each when an attempt busts or times out${retryKindNote(kind)}.`;
}

export function hasResetOption(fees: FeeSchedule): boolean {
    return fees.retry !== RetryKind.Rebuy && fees.reset > 0;
}

function retryKindNote(kind: RetryKind): string {
    switch (kind) {
        case RetryKind.Rebuy: {
            return '; a re-buy is a new account';
        }
        case RetryKind.Reset: {
            return '';
        }
    }
}

function retryNoun(kind: RetryKind, count: number): string {
    const singular = kind === RetryKind.Rebuy ? 're-buy' : 'reset';
    return count === 1 ? singular : `${singular}s`;
}
