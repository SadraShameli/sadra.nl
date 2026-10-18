import {
    compareText,
    dayNumberOf,
    paidPayoutCash,
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
    type LedgerPayoutRow,
    type PortfolioLedger,
} from './PortfolioLedger';
import {
    type CashSummary,
    feesOnOrBefore,
    ledgerFees,
    ledgerPayouts,
    paidPayoutsOnOrBefore,
    spendAndPayouts,
    summarizeCash,
} from './SpendAndPayouts';

export interface PortfolioRoi {
    readonly annualised: Roi;
    readonly cash: CashSummary;
    readonly elapsedDays: number;
    readonly futureDatedRows: number;
    readonly net: UsdCents;
    readonly netSpend: UsdCents;
    readonly payoutMultiple: null | number;
    readonly since: null | string;
    readonly total: Roi;
    readonly undatedPaidPayouts: number;
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
    const allFees = ledgerFees(ledger);
    const allPayouts = ledgerPayouts(ledger);
    const fees = feesOnOrBefore(allFees, asOf);
    const payouts = paidPayoutsOnOrBefore(allPayouts, asOf);
    const cash = summarizeCash(fees, payouts);
    const futureDatedRows =
        allFees.length -
        fees.length +
        allPayouts.filter((payout) => isPaidAfter(payout, asOf)).length;
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
        cash,
        elapsedDays,
        futureDatedRows,
        net: cash.net,
        netSpend: cash.spend,
        payoutMultiple: payoutMultiple(cash.payouts, cash.spend),
        since,
        total: totalRoiOnCost(cash.net, cash.spend),
        undatedPaidPayouts: spendAndPayouts(ledger).undatedPaidPayouts,
    };
}

function isPaidAfter(payout: LedgerPayoutRow, asOf: string): boolean {
    const paidOn = paidPayoutCash(payout)?.paidOn ?? null;
    return paidOn !== null && compareText(paidOn, asOf) > 0;
}
