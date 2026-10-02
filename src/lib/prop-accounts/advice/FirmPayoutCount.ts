import {
    AccountEventKind,
    compareText,
    FirmKeyKind,
    firmKeyOf,
    groupByFirmKey,
    isPaidOnOrBefore,
    type KindDatedEvent,
    latestEventOn,
    type PayoutCashFields,
    type StoredFirmId,
} from '~/lib/prop-accounts/core';
import { type PortfolioLedger } from '~/lib/prop-accounts/metrics';

export interface FirmPayoutCount {
    readonly firmId: StoredFirmId;
    readonly paidPayoutsSinceLastLiveAccount: number;
    readonly sinceOn: null | string;
}

export interface FirmPayoutCountAccount {
    readonly events: readonly KindDatedEvent[];
    readonly payouts: readonly PayoutCashFields[];
}

export const NO_FIRM_PAYOUT_COUNTS: readonly FirmPayoutCount[] = [];

export function firmPayoutCountOf(
    firmId: StoredFirmId,
    accounts: readonly FirmPayoutCountAccount[],
    asOf: string,
): FirmPayoutCount {
    const sinceOn = latestMovedLiveOn(accounts, asOf);
    const paidPayoutsSinceLastLiveAccount = accounts
        .flatMap((entry) => entry.payouts)
        .filter((payout) => isPaidSinceLastLive(payout, sinceOn, asOf))
        .length;
    return { firmId, paidPayoutsSinceLastLiveAccount, sinceOn };
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

export function isPaidSinceLastLive(
    payout: PayoutCashFields,
    sinceOn: null | string,
    asOf: string,
): boolean {
    return isPaidOnOrBefore(payout, asOf) && isAfter(payout.paidOn, sinceOn);
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

function isAfter(paidOn: null | string, sinceOn: null | string): boolean {
    return (
        sinceOn === null ||
        (paidOn !== null && compareText(paidOn, sinceOn) > 0)
    );
}

function latestMovedLiveOn(
    accounts: readonly FirmPayoutCountAccount[],
    asOf: string,
): null | string {
    return latestEventOn(
        accounts.flatMap((entry) => entry.events),
        AccountEventKind.MovedLive,
        asOf,
    );
}
