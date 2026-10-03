import {
    dayNumberOf,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
} from '~/lib/prop-accounts/core';

import {
    type LedgerPayoutRow,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
} from './PortfolioLedger';

export interface FirmPayoutLag {
    readonly firmKey: FirmKey;
    readonly requestToApproval: null | SampledEstimate;
    readonly requestToPaid: null | SampledEstimate;
}

export interface PayoutLag {
    readonly perFirm: readonly FirmPayoutLag[];
}

export function payoutLag(ledger: PortfolioLedger): PayoutLag {
    return {
        perFirm: groupByFirmKey(ledger.accounts, (entry) =>
            firmKeyOf(entry.row),
        ).map(({ firmKey, items }) => {
            const payouts = items.flatMap((entry) => entry.payouts);
            return {
                firmKey,
                requestToApproval: sampledMean(
                    payouts.flatMap((row) => lagDays(row, row.approvedOn)),
                ),
                requestToPaid: sampledMean(
                    payouts.flatMap((row) => lagDays(row, row.paidOn)),
                ),
            };
        }),
    };
}

function lagDays(
    payout: LedgerPayoutRow,
    on: null | string,
): readonly number[] {
    return on === null
        ? []
        : [dayNumberOf(on) - dayNumberOf(payout.requestedOn)];
}
