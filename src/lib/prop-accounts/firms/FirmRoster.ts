import {
    AccountEventKind,
    AccountTracking,
    compareText,
    type FirmColumnsRow,
    FirmEngagementReason,
    FirmEngagementStatus,
    type FirmKey,
    firmKeyId,
    firmKeyOf,
    groupByFirmKey,
} from '~/lib/prop-accounts/core';
import {
    firmColumnsOf,
    isActiveAccount,
    type LedgerAccount,
    type LedgerFirmEngagementRow,
    type PortfolioLedger,
} from '~/lib/prop-accounts/metrics';

import { movedLiveCountOf } from './LiveTransferRate';

export type FirmEngagementColumns = FirmColumnsRow;

export interface FirmRoster {
    readonly firms: readonly FirmRosterEntry[];
    readonly totalActive: number;
    readonly totalFirmsUsed: number;
    readonly totalSentLive: number;
}

export interface FirmRosterEntry {
    readonly activeAccounts: number;
    readonly firmKey: FirmKey;
    readonly firstPurchaseOn: null | string;
    readonly lastActivityOn: null | string;
    readonly lastMovedLiveOn: null | string;
    readonly lifetimeAccounts: number;
    readonly movedLiveCount: number;
    readonly reason: FirmEngagementReason | null;
    readonly recordedAtLiveCount: number;
    readonly status: FirmEngagementStatus;
}

export function firmEngagementFor<T extends FirmEngagementColumns>(
    firmKey: FirmKey,
    engagements: readonly T[],
): null | T {
    const targetKey = firmKeyId(firmKey);
    return (
        engagements.find(
            (row) => firmKeyId(firmKeyOf(firmColumnsOf(row))) === targetKey,
        ) ?? null
    );
}

export function firmRosterOf(ledger: PortfolioLedger): FirmRoster {
    const groups = groupByFirmKey(ledger.accounts, (entry) =>
        firmKeyOf(entry.row),
    );
    const firms = groups.map(({ firmKey, items }) =>
        firmRosterEntry(firmKey, items, ledger.firmEngagements),
    );
    return {
        firms,
        totalActive: firms.filter(
            (firm) => firm.status === FirmEngagementStatus.Active,
        ).length,
        totalFirmsUsed: firms.length,
        totalSentLive: firms.filter(
            (firm) => firm.reason === FirmEngagementReason.SentLive,
        ).length,
    };
}

export function recordedAtLiveText(count: number): string {
    return `includes ${String(count)} account${count === 1 ? '' : 's'} recorded straight at Live`;
}

function firmRosterEntry(
    firmKey: FirmKey,
    accounts: readonly LedgerAccount[],
    engagements: readonly LedgerFirmEngagementRow[],
): FirmRosterEntry {
    const engagement = firmEngagementFor(firmKey, engagements);
    const purchaseDates = accounts
        .map((entry) => entry.row.purchasedOn)
        .toSorted(compareText);
    const movedLiveDates = accounts
        .flatMap((entry) => entry.transitions)
        .filter((transition) => transition.kind === AccountEventKind.MovedLive)
        .map((transition) => transition.on)
        .toSorted(compareText);
    const activityDates = [
        ...purchaseDates,
        ...accounts.flatMap((entry) =>
            entry.events.map((row) => row.occurredOn),
        ),
        ...accounts.flatMap((entry) => entry.fees.map((row) => row.paidOn)),
        ...accounts.flatMap((entry) =>
            entry.payouts.map((row) => row.paidOn ?? row.requestedOn),
        ),
    ].toSorted(compareText);
    return {
        activeAccounts: accounts.filter((entry) => isActiveAccount(entry.row))
            .length,
        firmKey,
        firstPurchaseOn: purchaseDates.at(0) ?? null,
        lastActivityOn: activityDates.at(-1) ?? null,
        lastMovedLiveOn: movedLiveDates.at(-1) ?? null,
        lifetimeAccounts: accounts.length,
        movedLiveCount: accounts.reduce(
            (sum, entry) => sum + movedLiveCountOf(entry),
            0,
        ),
        reason: engagement?.reason ?? null,
        recordedAtLiveCount: accounts.filter(isRecordedStraightAtLive).length,
        status: engagement?.status ?? FirmEngagementStatus.Active,
    };
}

function isRecordedStraightAtLive(entry: LedgerAccount): boolean {
    return (
        entry.row.tracking === AccountTracking.LedgerOnly &&
        movedLiveCountOf(entry) > 0
    );
}
