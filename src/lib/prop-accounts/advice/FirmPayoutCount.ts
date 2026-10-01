import {
    AccountEventKind,
    compareText,
    FirmKeyKind,
    firmKeyOf,
    groupByFirmKey,
    isPaidOnOrBefore,
    latestEventOn,
    type StoredFirmId,
} from '~/lib/prop-accounts/core';
import {
    type LedgerAccount,
    type LedgerPayoutRow,
    type PortfolioLedger,
} from '~/lib/prop-accounts/metrics';

export interface FirmPayoutCount {
    readonly firmId: StoredFirmId;
    readonly paidPayoutsSinceLastLiveAccount: number;
    readonly sinceOn: null | string;
}

export function firmPayoutCounts(
    ledger: PortfolioLedger,
    asOf: string,
): readonly FirmPayoutCount[] {
    return groupByFirmKey(ledger.accounts, (entry) =>
        firmKeyOf(entry.row),
    ).flatMap((group) =>
        group.firmKey.kind === FirmKeyKind.Modeled
            ? [firmPayoutCountOf(group.firmKey.firmId, group.items, asOf)]
            : [],
    );
}

export function paidPayoutsSinceLastLiveAccountFor(
    counts: readonly FirmPayoutCount[],
    firmId: StoredFirmId,
): null | number {
    return (
        counts.find((entry) => entry.firmId === firmId)
            ?.paidPayoutsSinceLastLiveAccount ?? null
    );
}

function firmPayoutCountOf(
    firmId: StoredFirmId,
    accounts: readonly LedgerAccount[],
    asOf: string,
): FirmPayoutCount {
    const sinceOn = latestMovedLiveOn(accounts);
    const paidPayoutsSinceLastLiveAccount = accounts
        .flatMap((entry) => entry.payouts)
        .filter((payout) => isPaidSince(payout, sinceOn, asOf)).length;
    return { firmId, paidPayoutsSinceLastLiveAccount, sinceOn };
}

function isAfter(paidOn: null | string, sinceOn: null | string): boolean {
    return (
        sinceOn === null ||
        (paidOn !== null && compareText(paidOn, sinceOn) > 0)
    );
}

function isPaidSince(
    payout: LedgerPayoutRow,
    sinceOn: null | string,
    asOf: string,
): boolean {
    return isPaidOnOrBefore(payout, asOf) && isAfter(payout.paidOn, sinceOn);
}

function latestMovedLiveOn(accounts: readonly LedgerAccount[]): null | string {
    return latestEventOn(
        accounts.flatMap((entry) => entry.events),
        AccountEventKind.MovedLive,
    );
}
