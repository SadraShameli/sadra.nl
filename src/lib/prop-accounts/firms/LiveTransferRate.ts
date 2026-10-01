import {
    AccountEventKind,
    compareText,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    isEndedStatus,
    paidPayoutCash,
} from '~/lib/prop-accounts/core';
import {
    fundedSince,
    type LedgerAccount,
    type LifecycleTransition,
    monthsBetween,
    type PortfolioLedger,
    type SampledEstimate,
    sampledRate,
} from '~/lib/prop-accounts/metrics';

export interface FirmLiveTransferRate {
    readonly firmKey: FirmKey;
    readonly movedLiveCount: number;
    readonly perFundedAccountMonth: null | SampledEstimate;
    readonly perPaidPayout: null | SampledEstimate;
}

export interface LiveTransferRate {
    readonly perFirm: readonly FirmLiveTransferRate[];
}

export function liveTransferRate(
    ledger: PortfolioLedger,
    asOf: string,
): LiveTransferRate {
    return {
        perFirm: groupByFirmKey(ledger.resolvedAccounts, (entry) =>
            firmKeyOf(entry.row),
        ).map(({ firmKey, items }) =>
            firmLiveTransferRate(firmKey, items, asOf),
        ),
    };
}

function firmLiveTransferRate(
    firmKey: FirmKey,
    accounts: readonly LedgerAccount[],
    asOf: string,
): FirmLiveTransferRate {
    const movedLiveCount = accounts.reduce(
        (sum, entry) => sum + movedLiveTransitions(entry).length,
        0,
    );
    const paidPayoutCount = accounts.reduce(
        (sum, entry) =>
            sum +
            entry.payouts.filter((row) => paidPayoutCash(row) !== null).length,
        0,
    );
    const fundedAccountMonths = accounts.reduce(
        (sum, entry) => sum + fundedMonthsOf(entry, asOf),
        0,
    );
    return {
        firmKey,
        movedLiveCount,
        perFundedAccountMonth: sampledRate(movedLiveCount, fundedAccountMonths),
        perPaidPayout: sampledRate(movedLiveCount, paidPayoutCount),
    };
}

function fundedMonthsOf(entry: LedgerAccount, asOf: string): number {
    const since = fundedSince(entry);
    if (since === null) return 0;
    const movedLive = movedLiveTransitions(entry).at(0) ?? null;
    if (movedLive !== null) {
        return compareText(movedLive.on, since.on) < 0
            ? 0
            : monthsBetween(since.on, movedLive.on).length;
    }
    const last = entry.transitions.at(-1) ?? null;
    const endsOn =
        last !== null && isEndedStatus(last.to.status) ? last.on : asOf;
    return compareText(endsOn, since.on) < 0
        ? 0
        : monthsBetween(since.on, endsOn).length;
}

function movedLiveTransitions(
    entry: LedgerAccount,
): readonly LifecycleTransition[] {
    return entry.transitions.filter(
        (transition) => transition.kind === AccountEventKind.MovedLive,
    );
}
