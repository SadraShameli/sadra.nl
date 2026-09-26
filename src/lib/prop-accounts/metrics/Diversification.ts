import {
    compareText,
    paidPayoutCash,
    type StoredFirmId,
    sumUsdCents,
    type UsdCents,
} from '~/lib/prop-accounts/core';

import { fundedNominalOf, fundingTotals } from './FundingTotals';
import { type PortfolioLedger } from './PortfolioLedger';

export interface Diversification {
    readonly funding: readonly FirmShare[];
    readonly payouts: readonly FirmShare[];
}

export interface FirmShare {
    readonly cents: UsdCents;
    readonly firmId: StoredFirmId;
    readonly share: number;
}

interface FirmAmount {
    readonly cents: UsdCents;
    readonly firmId: StoredFirmId;
}

export function diversification(ledger: PortfolioLedger): Diversification {
    const firmIds = [
        ...new Set(ledger.accounts.map((entry) => entry.row.firmId)),
    ];
    return {
        funding: sharesOf(
            fundingTotals(ledger).byFirm.map((firm) => ({
                cents: fundedNominalOf(firm.byStage),
                firmId: firm.firmId,
            })),
        ),
        payouts: sharesOf(
            firmIds.map((firmId) => ({
                cents: sumUsdCents(
                    ledger.accounts
                        .filter((entry) => entry.row.firmId === firmId)
                        .flatMap((entry) => entry.payouts)
                        .flatMap((payout) => {
                            const cash = paidPayoutCash(payout);
                            return cash === null ? [] : [cash.cents];
                        }),
                ),
                firmId,
            })),
        ),
    };
}

function sharesOf(amounts: readonly FirmAmount[]): readonly FirmShare[] {
    const positive = amounts.filter((amount) => amount.cents > 0);
    const total = sumUsdCents(positive.map((amount) => amount.cents));
    return positive
        .map((amount) => ({ ...amount, share: amount.cents / total }))
        .toSorted(
            (a, b) => b.cents - a.cents || compareText(a.firmId, b.firmId),
        );
}
