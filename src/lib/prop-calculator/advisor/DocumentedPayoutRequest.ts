import {
    CENTS_PER_DOLLAR,
    type Dollars,
    effectivePayoutRequest,
    type PayoutMinimumSource,
} from '~/lib/prop-calculator/core';

import { type PayoutParameters } from './Rulebook';

export interface DocumentedPayoutRequest {
    readonly effective: Dollars;
    readonly requested: number;
}

export function documentedPayoutRequest(
    source: PayoutMinimumSource,
    personalOverride: null | number,
    payout: PayoutParameters,
): DocumentedPayoutRequest {
    const requested =
        personalOverride ?? payout.requestCents / CENTS_PER_DOLLAR;
    return { effective: effectivePayoutRequest(source, requested), requested };
}
