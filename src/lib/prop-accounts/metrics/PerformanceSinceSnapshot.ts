import {
    AccountEventKind,
    compareText,
    PayoutStatus,
    sumUsdCents,
    type UsdCents,
    usdCentsToDollars,
} from '~/lib/prop-accounts/core';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

export enum PerformanceComparabilityKind {
    Comparable = 'comparable',
    NotComparable = 'not-comparable',
}

export enum PerformanceIncomparabilityReason {
    FundedReset = 'funded-reset',
    LiveNotModeled = 'live-not-modeled',
    NoPreviousSnapshot = 'no-previous-snapshot',
    StageChange = 'stage-change',
}

export interface PerformanceEventRow {
    readonly kind: AccountEventKind;
    readonly occurredOn: string;
}

export interface PerformancePayoutRow {
    readonly grossCents: UsdCents;
    readonly paidOn: null | string;
    readonly status: PayoutStatus;
}

export type PerformanceSinceSnapshot =
    | {
          readonly kind: PerformanceComparabilityKind.Comparable;
          readonly normalizedBalanceChange: number;
          readonly payoutsPaidGross: number;
          readonly profitPerTradingDay: null | number;
          readonly profitSinceSnapshot: number;
          readonly tradingDaysElapsed: null | number;
      }
    | {
          readonly kind: PerformanceComparabilityKind.NotComparable;
          readonly reason: PerformanceIncomparabilityReason;
      };

export function performanceSinceSnapshot(
    latest: ReconstructedAccount,
    latestAsOf: string,
    previous: null | ReconstructedAccount,
    previousAsOf: null | string,
    events: readonly PerformanceEventRow[],
    payouts: readonly PerformancePayoutRow[],
): PerformanceSinceSnapshot {
    if (previous === null || previousAsOf === null) {
        return notComparable(
            PerformanceIncomparabilityReason.NoPreviousSnapshot,
        );
    }
    if (latest.kind !== previous.kind) {
        return notComparable(PerformanceIncomparabilityReason.StageChange);
    }
    const hasFundedResetInBetween = events.some(
        (event) =>
            event.kind === AccountEventKind.FundedReset &&
            compareText(event.occurredOn, previousAsOf) > 0 &&
            compareText(event.occurredOn, latestAsOf) <= 0,
    );
    if (hasFundedResetInBetween) {
        return notComparable(PerformanceIncomparabilityReason.FundedReset);
    }

    const latestBalance = balanceOf(latest);
    const previousBalance = balanceOf(previous);
    if (latestBalance === null || previousBalance === null) {
        return notComparable(PerformanceIncomparabilityReason.LiveNotModeled);
    }

    const payoutsPaidGrossCents = sumUsdCents(
        payouts
            .filter(
                (payout) =>
                    payout.status === PayoutStatus.Paid &&
                    payout.paidOn !== null &&
                    compareText(payout.paidOn, previousAsOf) > 0 &&
                    compareText(payout.paidOn, latestAsOf) <= 0,
            )
            .map((payout) => payout.grossCents),
    );
    const payoutsPaidGross = usdCentsToDollars(payoutsPaidGrossCents);
    const normalizedBalanceChange = latestBalance - previousBalance;
    const profitSinceSnapshot = normalizedBalanceChange + payoutsPaidGross;
    const tradingDaysElapsed = tradingDaysBetween(latest, previous);
    const profitPerTradingDay =
        tradingDaysElapsed === null || tradingDaysElapsed <= 0
            ? null
            : profitSinceSnapshot / tradingDaysElapsed;

    return {
        kind: PerformanceComparabilityKind.Comparable,
        normalizedBalanceChange,
        payoutsPaidGross,
        profitPerTradingDay,
        profitSinceSnapshot,
        tradingDaysElapsed,
    };
}

function balanceOf(account: ReconstructedAccount): null | number {
    return account.kind === ReconstructedLiveKind.Live
        ? (account.state?.balance ?? null)
        : account.state.balance;
}

function notComparable(
    reason: PerformanceIncomparabilityReason,
): PerformanceSinceSnapshot {
    return { kind: PerformanceComparabilityKind.NotComparable, reason };
}

function tradingDaysBetween(
    latest: ReconstructedAccount,
    previous: ReconstructedAccount,
): null | number {
    return latest.kind === ReconstructedLiveKind.Live ||
        previous.kind === ReconstructedLiveKind.Live
        ? null
        : latest.state.tradingDays - previous.state.tradingDays;
}
