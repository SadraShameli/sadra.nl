import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
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

export enum LiveTransferRateUnavailable {
    MoreTransfersThanFundedMonths = 'more-transfers-than-funded-months',
    MoreTransfersThanPayouts = 'more-transfers-than-payouts',
    NoFundedMonths = 'no-funded-months',
    NoPaidPayouts = 'no-paid-payouts',
}

export interface FirmLiveTransferRate {
    readonly firmKey: FirmKey;
    readonly fundedAccountMonths: number;
    readonly movedLiveCount: number;
    readonly paidPayoutCount: number;
    readonly perFundedAccountMonth: null | SampledEstimate;
    readonly perFundedAccountMonthUnavailable: LiveTransferRateUnavailable | null;
    readonly perPaidPayout: null | SampledEstimate;
    readonly perPaidPayoutUnavailable: LiveTransferRateUnavailable | null;
}

export interface LiveTransferRate {
    readonly perFirm: readonly FirmLiveTransferRate[];
}

export function liveTransferRate(
    ledger: PortfolioLedger,
    asOf: string,
): LiveTransferRate {
    return {
        perFirm: groupByFirmKey(ledger.accounts, (entry) =>
            firmKeyOf(entry.row),
        ).map(({ firmKey, items }) =>
            firmLiveTransferRate(firmKey, items, asOf),
        ),
    };
}

export function liveTransferUnavailableText(
    reason: LiveTransferRateUnavailable,
    rate: FirmLiveTransferRate,
): string {
    const transfers = countOf(rate.movedLiveCount, 'transfer');
    switch (reason) {
        case LiveTransferRateUnavailable.MoreTransfersThanFundedMonths: {
            return `${transfers} against ${countOf(rate.fundedAccountMonths, 'funded account-month')}`;
        }
        case LiveTransferRateUnavailable.MoreTransfersThanPayouts: {
            return `${transfers} against ${countOf(rate.paidPayoutCount, 'paid payout')}`;
        }
        case LiveTransferRateUnavailable.NoFundedMonths: {
            return 'no funded account-months yet';
        }
        case LiveTransferRateUnavailable.NoPaidPayouts: {
            return 'no paid payouts yet';
        }
    }
}

export function movedLiveCountOf(entry: LedgerAccount): number {
    if (entry.row.tracking === AccountTracking.LedgerOnly) {
        return entry.row.stage === AccountStage.Live ? 1 : 0;
    }
    return movedLiveTransitions(entry).length;
}

function countOf(count: number, noun: string): string {
    return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function firmLiveTransferRate(
    firmKey: FirmKey,
    accounts: readonly LedgerAccount[],
    asOf: string,
): FirmLiveTransferRate {
    const exposures = accounts.map((entry) => ({
        fundedMonths: fundedMonthsOf(entry, asOf),
        movedLive: movedLiveCountOf(entry),
    }));
    const movedLiveCount = sumOf(exposures, (entry) => entry.movedLive);
    const exposedMovedLiveCount = sumOf(exposures, (entry) =>
        entry.fundedMonths > 0 ? entry.movedLive : 0,
    );
    const fundedAccountMonths = sumOf(exposures, (entry) => entry.fundedMonths);
    const paidPayoutCount = sumOf(
        accounts,
        (entry) =>
            entry.payouts.filter((row) => paidPayoutCash(row) !== null).length,
    );
    const perPaidPayout = rateOrReason(movedLiveCount, paidPayoutCount, {
        empty: LiveTransferRateUnavailable.NoPaidPayouts,
        excess: LiveTransferRateUnavailable.MoreTransfersThanPayouts,
    });
    const perFundedAccountMonth = rateOrReason(
        exposedMovedLiveCount,
        fundedAccountMonths,
        {
            empty: LiveTransferRateUnavailable.NoFundedMonths,
            excess: LiveTransferRateUnavailable.MoreTransfersThanFundedMonths,
        },
    );
    return {
        firmKey,
        fundedAccountMonths,
        movedLiveCount,
        paidPayoutCount,
        perFundedAccountMonth: perFundedAccountMonth.estimate,
        perFundedAccountMonthUnavailable: perFundedAccountMonth.unavailable,
        perPaidPayout: perPaidPayout.estimate,
        perPaidPayoutUnavailable: perPaidPayout.unavailable,
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

function rateOrReason(
    successes: number,
    n: number,
    reasons: {
        readonly empty: LiveTransferRateUnavailable;
        readonly excess: LiveTransferRateUnavailable;
    },
): {
    readonly estimate: null | SampledEstimate;
    readonly unavailable: LiveTransferRateUnavailable | null;
} {
    const unavailable = unavailableReasonOf(successes, n, reasons);
    return {
        estimate: unavailable === null ? sampledRate(successes, n) : null,
        unavailable,
    };
}

function sumOf<Item>(
    items: readonly Item[],
    valueOf: (item: Item) => number,
): number {
    return items.reduce((sum, item) => sum + valueOf(item), 0);
}

function unavailableReasonOf(
    successes: number,
    n: number,
    reasons: {
        readonly empty: LiveTransferRateUnavailable;
        readonly excess: LiveTransferRateUnavailable;
    },
): LiveTransferRateUnavailable | null {
    if (n === 0) return reasons.empty;
    return successes > n ? reasons.excess : null;
}
