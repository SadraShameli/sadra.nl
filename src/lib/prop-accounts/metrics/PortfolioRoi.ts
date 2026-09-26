import {
    compareText,
    dayNumberOf,
    type UsdCents,
} from '~/lib/prop-accounts/core';
import {
    annualisedRoiOnCost,
    type Roi,
    RoiBasis,
    totalRoiOnCost,
} from '~/lib/prop-calculator';

import {
    AVERAGE_DAYS_PER_MONTH,
    type PortfolioLedger,
} from './PortfolioLedger';
import {
    feesOnOrBefore,
    ledgerFees,
    ledgerPayouts,
    paidPayoutsOnOrBefore,
    summarizeCash,
} from './SpendAndPayouts';

export interface PortfolioRoi {
    readonly annualised: Roi;
    readonly elapsedDays: number;
    readonly net: UsdCents;
    readonly netSpend: UsdCents;
    readonly payoutMultiple: null | number;
    readonly since: null | string;
    readonly total: Roi;
}

export function payoutMultiple(
    payouts: UsdCents,
    spend: UsdCents,
): null | number {
    return spend === 0 ? null : payouts / spend;
}

export function portfolioRoi(
    ledger: PortfolioLedger,
    asOf: string,
): PortfolioRoi {
    const asOfDay = dayNumberOf(asOf);
    const fees = feesOnOrBefore(ledgerFees(ledger), asOf);
    const cash = summarizeCash(
        fees,
        paidPayoutsOnOrBefore(ledgerPayouts(ledger), asOf),
    );
    const [since = null] = [
        ...ledger.accounts.map((entry) => entry.row.purchasedOn),
        ...fees.map((fee) => fee.paidOn),
    ].toSorted(compareText);
    const elapsedDays =
        since === null ? 0 : Math.max(0, asOfDay - dayNumberOf(since) + 1);
    return {
        annualised:
            elapsedDays === 0
                ? { basis: RoiBasis.AnnualisedOnCost, value: null }
                : annualisedRoiOnCost(
                      cash.net / (elapsedDays / AVERAGE_DAYS_PER_MONTH),
                      cash.spend,
                  ),
        elapsedDays,
        net: cash.net,
        netSpend: cash.spend,
        payoutMultiple: payoutMultiple(cash.payouts, cash.spend),
        since,
        total: totalRoiOnCost(cash.net, cash.spend),
    };
}
