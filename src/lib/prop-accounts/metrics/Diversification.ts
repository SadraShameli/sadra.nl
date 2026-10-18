import {
    compareFirmKeys,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    paidPayoutCash,
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
    readonly firmKey: FirmKey;
    readonly share: number;
}

interface FirmAmount {
    readonly cents: UsdCents;
    readonly firmKey: FirmKey;
}

export function diversification(ledger: PortfolioLedger): Diversification {
    return {
        funding: sharesOf(
            fundingTotals(ledger).byFirm.map((firm) => ({
                cents: fundedNominalOf(firm.byStage),
                firmKey: firm.firmKey,
            })),
        ),
        payouts: sharesOf(
            groupByFirmKey(ledger.accounts, (entry) =>
                firmKeyOf(entry.row),
            ).map(({ firmKey, items }) => ({
                cents: sumUsdCents(
                    items
                        .flatMap((entry) => entry.payouts)
                        .flatMap((payout) => {
                            const cash = paidPayoutCash(payout);
                            return cash === null ? [] : cash.cents;
                        }),
                ),
                firmKey,
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
            (a, b) =>
                b.cents - a.cents || compareFirmKeys(a.firmKey, b.firmKey),
        );
}
