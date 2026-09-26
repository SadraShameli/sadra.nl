import { compareText } from './IsoDate';
import { PayoutStatus } from './PayoutStatus';
import { type UsdCents } from './UsdCents';

export interface PaidPayoutCash {
    readonly cents: UsdCents;
    readonly grossOnly: boolean;
    readonly paidOn: null | string;
}

export interface PayoutCashFields {
    readonly grossCents: UsdCents;
    readonly netCents: null | UsdCents;
    readonly paidOn: null | string;
    readonly status: PayoutStatus;
}

export function isPaidOnOrBefore(
    payout: PayoutCashFields,
    asOf: string,
): boolean {
    const paidOn = paidPayoutCash(payout)?.paidOn ?? null;
    return paidOn !== null && compareText(paidOn, asOf) <= 0;
}

export function paidPayoutCash(
    payout: PayoutCashFields,
): null | PaidPayoutCash {
    if (payout.status !== PayoutStatus.Paid) return null;
    return payout.netCents === null
        ? { cents: payout.grossCents, grossOnly: true, paidOn: payout.paidOn }
        : { cents: payout.netCents, grossOnly: false, paidOn: payout.paidOn };
}
