import {
    AccountEventKind,
    accountShapeProblem,
    compareText,
    FirmKeyKind,
    firmKeyOf,
    groupByFirmKey,
    isAccountDate,
    isPaidOnOrBefore,
    type KindDatedEvent,
    latestEventOn,
    type PayoutCashFields,
    PayoutStatus,
    type StoredFirmId,
    type TrackedColumns,
} from '~/lib/prop-accounts/core';
import { type PortfolioLedger } from '~/lib/prop-accounts/metrics';

export enum FirmCountUnknownReason {
    InvalidDate = 'invalid-date',
    UnreadableAccount = 'unreadable-account',
}

export enum FirmPayoutCountResultKind {
    Known = 'known',
    Unknown = 'unknown',
}

export interface FirmCountMember extends FirmPayoutCountAccount {
    readonly account: TrackedColumns;
}

export interface FirmPayoutCount {
    readonly asOf: string;
    readonly firmId: StoredFirmId;
    readonly paidPayoutsSinceLastLiveAccount: number;
    readonly requestedPayoutsSinceLastLiveAccount: number;
    readonly sinceOn: null | string;
}

export interface FirmPayoutCountAccount {
    readonly events: readonly KindDatedEvent[];
    readonly payouts: readonly FirmPayoutRow[];
}

export type FirmPayoutCountResult =
    | {
          readonly count: FirmPayoutCount;
          readonly kind: FirmPayoutCountResultKind.Known;
      }
    | {
          readonly kind: FirmPayoutCountResultKind.Unknown;
          readonly reason: FirmCountUnknownReason;
      };

interface FirmPayoutRow extends PayoutCashFields {
    readonly requestedOn: string;
}

export const NO_FIRM_PAYOUT_COUNTS: readonly FirmPayoutCount[] = [];

export function firmPayoutCountOf(
    firmId: StoredFirmId,
    accounts: readonly FirmPayoutCountAccount[],
    asOf: string,
): FirmPayoutCount {
    const sinceOn = latestMovedLiveOn(accounts, asOf);
    const payouts = accounts.flatMap((entry) => entry.payouts);
    return {
        asOf,
        firmId,
        paidPayoutsSinceLastLiveAccount: payouts.filter((payout) =>
            isPaidSinceLastLive(payout, sinceOn, asOf),
        ).length,
        requestedPayoutsSinceLastLiveAccount: requestedPayoutCountSince(
            payouts,
            sinceOn,
            asOf,
        ),
        sinceOn,
    };
}

export function firmPayoutCountOrNull(
    counts: readonly FirmPayoutCount[],
    firmId: StoredFirmId,
): FirmPayoutCount | null {
    return counts.find((entry) => entry.firmId === firmId) ?? null;
}

export function firmPayoutCountResultOf(
    firmId: StoredFirmId,
    members: readonly FirmCountMember[],
    asOf: string,
): FirmPayoutCountResult {
    const firmMembers = members.filter(
        (member) => member.account.firmId === firmId,
    );
    if (firmMembers.some(hasUnreadableShape)) {
        return unknownCount(FirmCountUnknownReason.UnreadableAccount);
    }
    if (firmMembers.some(hasInvalidDate)) {
        return unknownCount(FirmCountUnknownReason.InvalidDate);
    }
    return {
        count: firmPayoutCountOf(firmId, firmMembers, asOf),
        kind: FirmPayoutCountResultKind.Known,
    };
}

export function firmPayoutCounts(
    ledger: PortfolioLedger,
    asOf: string,
): readonly FirmPayoutCount[] {
    const members = ledger.accounts.map((entry): FirmCountMember => ({
        account: entry.row,
        events: entry.events,
        payouts: entry.payouts,
    }));
    return groupByFirmKey(ledger.accounts, (entry) =>
        firmKeyOf(entry.row),
    ).flatMap((group) => {
        if (group.firmKey.kind !== FirmKeyKind.Modeled) return [];
        const result = firmPayoutCountResultOf(
            group.firmKey.firmId,
            members,
            asOf,
        );
        return result.kind === FirmPayoutCountResultKind.Known
            ? [result.count]
            : [];
    });
}

export function isFirmCountMemberReadable(member: FirmCountMember): boolean {
    return !hasUnreadableShape(member) && !hasInvalidDate(member);
}

export function isPaidSinceLastLive(
    payout: PayoutCashFields,
    sinceOn: null | string,
    asOf: string,
): boolean {
    return isPaidOnOrBefore(payout, asOf) && isAfter(payout.paidOn, sinceOn);
}

export function otherAccountsRequestedPayoutCountOf(
    firmCount: FirmPayoutCount,
    ownPayouts: readonly FirmPayoutRow[],
    asOf: string,
): number {
    return Math.max(
        0,
        firmCount.requestedPayoutsSinceLastLiveAccount -
            ownRequestedPayoutCountOf(firmCount, ownPayouts, asOf),
    );
}

export function ownRequestedPayoutCountOf(
    firmCount: FirmPayoutCount,
    ownPayouts: readonly FirmPayoutRow[],
    asOf: string,
): number {
    return requestedPayoutCountSince(ownPayouts, firmCount.sinceOn, asOf);
}

export function paidPayoutsSinceLastLiveAccountFor(
    counts: readonly FirmPayoutCount[],
    firmId: StoredFirmId,
): null | number {
    return (
        firmPayoutCountOrNull(counts, firmId)
            ?.paidPayoutsSinceLastLiveAccount ?? null
    );
}

export function requestedPayoutCountAt(
    payouts: readonly FirmPayoutRow[],
    asOf: string,
): number {
    return requestedPayoutCountSince(payouts, null, asOf);
}

function hasInvalidDate(member: FirmCountMember): boolean {
    return (
        member.payouts.some(
            (payout) =>
                !isAccountDate(payout.requestedOn) ||
                isUndatedPaid(payout) ||
                (payout.paidOn !== null && !isAccountDate(payout.paidOn)),
        ) ||
        member.events.some(
            (event) =>
                event.kind === AccountEventKind.MovedLive &&
                !isAccountDate(event.occurredOn),
        )
    );
}

function hasUnreadableShape(member: FirmCountMember): boolean {
    return accountShapeProblem(member.account) !== null;
}

function isAfter(paidOn: null | string, sinceOn: null | string): boolean {
    return (
        sinceOn === null ||
        (paidOn !== null && compareText(paidOn, sinceOn) > 0)
    );
}

function isOpenOn(payout: FirmPayoutRow, asOf: string): boolean {
    switch (payout.status) {
        case PayoutStatus.Cancelled:
        case PayoutStatus.Denied: {
            return false;
        }
        case PayoutStatus.Paid: {
            return (
                payout.paidOn !== null && compareText(payout.paidOn, asOf) > 0
            );
        }
        case PayoutStatus.Requested: {
            return true;
        }
    }
}

function isRequestedSinceLastLive(
    payout: FirmPayoutRow,
    sinceOn: null | string,
    asOf: string,
): boolean {
    return (
        isOpenOn(payout, asOf) &&
        compareText(payout.requestedOn, asOf) <= 0 &&
        isAfter(payout.requestedOn, sinceOn)
    );
}

function isUndatedPaid(payout: FirmPayoutRow): boolean {
    return payout.status === PayoutStatus.Paid && payout.paidOn === null;
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

function requestedPayoutCountSince(
    payouts: readonly FirmPayoutRow[],
    sinceOn: null | string,
    asOf: string,
): number {
    return payouts.filter((payout) =>
        isRequestedSinceLastLive(payout, sinceOn, asOf),
    ).length;
}

function unknownCount(reason: FirmCountUnknownReason): FirmPayoutCountResult {
    return { kind: FirmPayoutCountResultKind.Unknown, reason };
}
