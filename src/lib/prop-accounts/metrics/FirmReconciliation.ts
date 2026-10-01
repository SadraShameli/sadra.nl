import {
    compareFirmKeys,
    compareText,
    type FirmKey,
    firmKeyId,
    firmKeyOf,
    isPaidOnOrBefore,
    isWithinPayoutTolerance,
    PayoutStatus,
    ReportedPayoutBasis,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';

import {
    firmColumnsOf,
    type LedgerFirmStatementRow,
    type PortfolioLedger,
} from './PortfolioLedger';

export interface FirmReconciliationEntry {
    readonly asOf: string;
    readonly basis: ReportedPayoutBasis;
    readonly changeFromPreviousCents: null | number;
    readonly decreasedFromPrevious: boolean;
    readonly differenceCents: number;
    readonly firmKey: FirmKey;
    readonly grossOnlyCount: number;
    readonly id: string;
    readonly ledgerPaidCents: UsdCents;
    readonly reportedPayoutCents: UsdCents;
    readonly withinTolerance: boolean;
}

export function firmReconciliation(
    ledger: PortfolioLedger,
): readonly FirmReconciliationEntry[] {
    const groups = new Map<string, LedgerFirmStatementRow[]>();
    for (const statement of ledger.firmStatements) {
        const key = firmKeyId(firmKeyOf(firmColumnsOf(statement)));
        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, [statement]);
        } else {
            group.push(statement);
        }
    }
    const entries = groups
        .values()
        .flatMap((group) => entriesForFirm(ledger, group))
        .toArray();
    return entries.toSorted(
        (a, b) =>
            compareFirmKeys(a.firmKey, b.firmKey) ||
            compareText(a.asOf, b.asOf),
    );
}

function entriesForFirm(
    ledger: PortfolioLedger,
    statements: readonly LedgerFirmStatementRow[],
): readonly FirmReconciliationEntry[] {
    const sorted = statements.toSorted(
        (a, b) => compareText(a.asOf, b.asOf) || compareText(a.id, b.id),
    );
    const entries: FirmReconciliationEntry[] = [];
    let previous: LedgerFirmStatementRow | null = null;
    for (const statement of sorted) {
        const firmKey = firmKeyOf(firmColumnsOf(statement));
        const ledgerTotal = paidTotalThrough(
            ledger,
            firmKey,
            statement.asOf,
            statement.basis,
        );
        const differenceCents =
            statement.reportedPayoutCents - ledgerTotal.cents;
        entries.push({
            asOf: statement.asOf,
            basis: statement.basis,
            changeFromPreviousCents:
                previous === null
                    ? null
                    : statement.reportedPayoutCents -
                      previous.reportedPayoutCents,
            decreasedFromPrevious:
                previous !== null &&
                statement.reportedPayoutCents < previous.reportedPayoutCents,
            differenceCents,
            firmKey,
            grossOnlyCount: ledgerTotal.grossOnlyCount,
            id: statement.id,
            ledgerPaidCents: usdCents(ledgerTotal.cents),
            reportedPayoutCents: usdCents(statement.reportedPayoutCents),
            withinTolerance: isWithinPayoutTolerance(differenceCents),
        });
        previous = statement;
    }
    return entries;
}

function paidTotalThrough(
    ledger: PortfolioLedger,
    firmKey: FirmKey,
    asOf: string,
    basis: ReportedPayoutBasis,
): { readonly cents: number; readonly grossOnlyCount: number } {
    let cents = 0;
    let grossOnlyCount = 0;
    const targetKey = firmKeyId(firmKey);
    for (const entry of ledger.accounts) {
        if (firmKeyId(firmKeyOf(entry.row)) !== targetKey) continue;
        for (const row of entry.payouts) {
            if (
                row.status !== PayoutStatus.Paid ||
                !isPaidOnOrBefore(row, asOf)
            ) {
                continue;
            }
            if (basis === ReportedPayoutBasis.Gross) {
                cents += row.grossCents;
                continue;
            }
            if (row.netCents === null) {
                cents += row.grossCents;
                grossOnlyCount += 1;
            } else {
                cents += row.netCents;
            }
        }
    }
    return { cents, grossOnlyCount };
}
