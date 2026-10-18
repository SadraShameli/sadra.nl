import {
    compareText,
    FeeKind,
    isoMonthOf,
    isPaidOnOrBefore,
    paidPayoutCash,
    sumUsdCents,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';

import {
    type LedgerFeeRow,
    type LedgerPayoutRow,
    type PortfolioLedger,
    signedFeeCents,
} from './PortfolioLedger';

export interface CashSummary {
    readonly feesBeforeRefunds: UsdCents;
    readonly grossOnlyPayouts: number;
    readonly net: UsdCents;
    readonly paidPayouts: number;
    readonly payouts: UsdCents;
    readonly refunds: UsdCents;
    readonly spend: UsdCents;
}

export interface MonthlyCash extends CashSummary {
    readonly month: string;
}

export interface SpendAndPayouts {
    readonly allTime: CashSummary;
    readonly byMonth: readonly MonthlyCash[];
    readonly undatedPaidPayouts: number;
}

export function feesOnOrBefore(
    fees: readonly LedgerFeeRow[],
    asOf: string,
): readonly LedgerFeeRow[] {
    return fees.filter((fee) => compareText(fee.paidOn, asOf) <= 0);
}

export function ledgerFees(ledger: PortfolioLedger): readonly LedgerFeeRow[] {
    return ledger.accounts.flatMap((entry) => entry.fees);
}

export function ledgerPayouts(
    ledger: PortfolioLedger,
): readonly LedgerPayoutRow[] {
    return ledger.accounts.flatMap((entry) => entry.payouts);
}

export function monthlyCash(
    fees: readonly LedgerFeeRow[],
    payouts: readonly LedgerPayoutRow[],
): readonly MonthlyCash[] {
    const datedPayouts = payouts.flatMap((payout) => {
        const paidOn = paidPayoutCash(payout)?.paidOn ?? null;
        return paidOn === null ? [] : { month: isoMonthOf(paidOn), payout };
    });
    const datedFees = fees.map((fee) => ({
        fee,
        month: isoMonthOf(fee.paidOn),
    }));
    const months = new Set([
        ...datedFees.map((dated) => dated.month),
        ...datedPayouts.map((dated) => dated.month),
    ]);
    return [...months].toSorted(compareText).map((month) => ({
        month,
        ...summarizeCash(
            datedFees
                .filter((dated) => dated.month === month)
                .map((dated) => dated.fee),
            datedPayouts
                .filter((dated) => dated.month === month)
                .map((dated) => dated.payout),
        ),
    }));
}

export function paidPayoutsOnOrBefore(
    payouts: readonly LedgerPayoutRow[],
    asOf: string,
): readonly LedgerPayoutRow[] {
    return payouts.filter((payout) => isPaidOnOrBefore(payout, asOf));
}

export function spendAndPayouts(ledger: PortfolioLedger): SpendAndPayouts {
    const fees = ledgerFees(ledger);
    const payouts = ledgerPayouts(ledger);
    return {
        allTime: summarizeCash(fees, payouts),
        byMonth: monthlyCash(fees, payouts),
        undatedPaidPayouts: payouts.filter(
            (payout) => paidPayoutCash(payout)?.paidOn === null,
        ).length,
    };
}

export function summarizeCash(
    fees: readonly LedgerFeeRow[],
    payouts: readonly LedgerPayoutRow[],
): CashSummary {
    const refunds = fees.filter((fee) => fee.kind === FeeKind.Refund);
    const charges = fees.filter((fee) => fee.kind !== FeeKind.Refund);
    const paid = payouts.flatMap((payout) => {
        const cash = paidPayoutCash(payout);
        return cash === null ? [] : [cash];
    });
    const spend = sumUsdCents(fees.map((fee) => signedFeeCents(fee)));
    const payoutTotal = sumUsdCents(paid.map((cash) => cash.cents));
    return {
        feesBeforeRefunds: sumUsdCents(charges.map((fee) => fee.amountCents)),
        grossOnlyPayouts: paid.filter((cash) => cash.grossOnly).length,
        net: usdCents(payoutTotal - spend),
        paidPayouts: paid.length,
        payouts: payoutTotal,
        refunds: sumUsdCents(refunds.map((fee) => fee.amountCents)),
        spend,
    };
}
