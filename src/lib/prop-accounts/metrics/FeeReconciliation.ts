import {
    type FeeKind,
    feePrefillCents,
    type FeePrefillPlan,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';

import { type LedgerFeeRow, type PortfolioLedger } from './PortfolioLedger';

export enum FeePriceCheck {
    AboveList = 'above-list',
    AtList = 'at-list',
    Discounted = 'discounted',
    NoListPrice = 'no-list-price',
}

export type FeeCheckInput = Pick<
    LedgerFeeRow,
    'accountId' | 'amountCents' | 'id' | 'kind'
>;

export interface FeeCheckRow {
    readonly accountId: string;
    readonly check: FeePriceCheck;
    readonly differenceCents: null | UsdCents;
    readonly feeId: string;
    readonly kind: FeeKind;
    readonly listCents: null | UsdCents;
    readonly paidCents: UsdCents;
}

export interface FeeReconciliation {
    readonly byFirm: readonly FirmDiscountCapture[];
    readonly excludedFeeRows: number;
    readonly rows: readonly FeeCheckRow[];
}

export interface FirmDiscountCapture {
    readonly discountCents: UsdCents;
    readonly feesChecked: number;
    readonly firmKey: FirmKey;
}

export function feeCheckRowOf(
    plan: FeePrefillPlan | null,
    fee: FeeCheckInput,
): FeeCheckRow {
    const listCents = plan === null ? null : feePrefillCents(plan, fee.kind);
    return {
        accountId: fee.accountId,
        check: priceCheck(fee.amountCents, listCents),
        differenceCents:
            listCents === null ? null : usdCents(fee.amountCents - listCents),
        feeId: fee.id,
        kind: fee.kind,
        listCents,
        paidCents: fee.amountCents,
    };
}

export function feeReconciliation(ledger: PortfolioLedger): FeeReconciliation {
    const perAccountRows = ledger.resolvedAccounts.map((entry) => ({
        entry,
        rows: entry.fees.map((fee) =>
            feeCheckRowOf(entry.plan?.plan ?? null, fee),
        ),
    }));
    return {
        byFirm: groupByFirmKey(perAccountRows, ({ entry }) =>
            firmKeyOf(entry.row),
        ).map(({ firmKey, items }) => {
            const rows = items.flatMap((item) => item.rows);
            return {
                discountCents: usdCents(
                    rows.reduce(
                        (sum, row) =>
                            sum +
                            (row.check === FeePriceCheck.Discounted &&
                            row.differenceCents !== null
                                ? 0 - row.differenceCents
                                : 0),
                        0,
                    ),
                ),
                feesChecked: rows.length,
                firmKey,
            };
        }),
        excludedFeeRows: ledger.accounts
            .filter((entry) => entry.plan === null)
            .reduce((sum, entry) => sum + entry.fees.length, 0),
        rows: perAccountRows.flatMap((item) => item.rows),
    };
}

function priceCheck(
    paidCents: UsdCents,
    listCents: null | UsdCents,
): FeePriceCheck {
    if (listCents === null) return FeePriceCheck.NoListPrice;
    if (paidCents < listCents) return FeePriceCheck.Discounted;
    return paidCents === listCents
        ? FeePriceCheck.AtList
        : FeePriceCheck.AboveList;
}
