import {
    type AccountEventKind,
    compareText,
    type FeeKind,
    isoMonthOf,
    type PayoutStatus,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';

import { feesByKind } from './CostAnalytics';
import {
    type LedgerAccount,
    type PortfolioLedger,
    signedFeeCents,
} from './PortfolioLedger';
import { payoutMultiple } from './PortfolioRoi';
import {
    ledgerFees,
    ledgerPayouts,
    type MonthlyCash,
    monthlyCash,
    summarizeCash,
} from './SpendAndPayouts';

export const MONTHLY_MULTIPLE_CAVEAT =
    'calendar months mix purchase cohorts; see By purchase cohort';

const TRAILING_MULTIPLE_MONTHS = 3;

export enum TimelineEntryKind {
    Event = 'event',
    Fee = 'fee',
    Payout = 'payout',
}

export interface MonthlyStatement {
    readonly months: readonly StatementMonth[];
}

export interface MonthlyStatementTargets {
    readonly monthlyPayoutTargetCents: null | number;
    readonly targetMonthlyMultiple: null | number;
}

export interface StatementMonth extends MonthlyCash {
    readonly cumulativeNet: UsdCents;
    readonly events: Readonly<Partial<Record<AccountEventKind, number>>>;
    readonly feesByKind: Readonly<Record<FeeKind, UsdCents>>;
    readonly isPartial: boolean;
    readonly meetsMultipleTarget: boolean | null;
    readonly meetsPayoutTarget: boolean | null;
    readonly multiple: null | number;
    readonly payoutGrowth: null | number;
    readonly trailingThreeMonthMultiple: null | number;
}

export type TimelineEntry =
    | (TimelineEntryBase & {
          readonly eventKind: AccountEventKind;
          readonly kind: TimelineEntryKind.Event;
      })
    | (TimelineEntryBase & {
          readonly feeKind: FeeKind;
          readonly kind: TimelineEntryKind.Fee;
          readonly signedCents: UsdCents;
      })
    | (TimelineEntryBase & {
          readonly grossCents: UsdCents;
          readonly kind: TimelineEntryKind.Payout;
          readonly netCents: null | UsdCents;
          readonly status: PayoutStatus;
      });

interface TimelineEntryBase {
    readonly accountId: string;
    readonly accountLabel: string;
    readonly id: string;
    readonly on: string;
}

export function earliestActivityMonth(ledger: PortfolioLedger): null | string {
    const dates = ledger.accounts.map((entry) => entry.row.purchasedOn);
    return dates.length === 0
        ? null
        : isoMonthOf(dates.toSorted(compareText)[0] ?? dates[0] ?? '');
}

export function filledMonths(
    earliestMonth: null | string,
    asOfMonth: string,
): readonly string[] {
    return earliestMonth === null || compareText(earliestMonth, asOfMonth) > 0
        ? []
        : monthsBetween(earliestMonth, asOfMonth);
}

export function ledgerTimeline(
    ledger: PortfolioLedger,
): readonly TimelineEntry[] {
    return ledger.accounts
        .flatMap((entry) => accountTimeline(entry))
        .toSorted(
            (a, b) =>
                compareText(a.on, b.on) ||
                timelineRank(a.kind) - timelineRank(b.kind) ||
                compareText(a.id, b.id),
        );
}

export function monthlyStatement(
    ledger: PortfolioLedger,
    asOf: string,
    targets: MonthlyStatementTargets,
): MonthlyStatement {
    const fees = ledgerFees(ledger);
    const payouts = ledgerPayouts(ledger);
    const cashByMonth = new Map(
        monthlyCash(fees, payouts).map((cash) => [cash.month, cash]),
    );
    const eventsByMonth = new Map<
        string,
        Partial<Record<AccountEventKind, number>>
    >();
    const events = ledger.accounts.flatMap((entry) => entry.events);
    for (const event of events) {
        const month = isoMonthOf(event.occurredOn);
        const counts = eventsByMonth.get(month) ?? {};
        counts[event.kind] = (counts[event.kind] ?? 0) + 1;
        eventsByMonth.set(month, counts);
    }
    const asOfMonth = isoMonthOf(asOf);
    const months = filledMonths(earliestActivityMonth(ledger), asOfMonth);
    let cumulativeNet = 0;
    const trailingSpend: number[] = [];
    const trailingPayouts: number[] = [];
    let previousPayouts: null | number = null;
    return {
        months: months.map((month) => {
            const cash: MonthlyCash = cashByMonth.get(month) ?? {
                month,
                ...summarizeCash([], []),
            };
            cumulativeNet += cash.net;
            trailingSpend.push(cash.spend);
            trailingPayouts.push(cash.payouts);
            if (trailingSpend.length > TRAILING_MULTIPLE_MONTHS) {
                trailingSpend.shift();
                trailingPayouts.shift();
            }
            const growth =
                previousPayouts === null || previousPayouts === 0
                    ? null
                    : (cash.payouts - previousPayouts) / previousPayouts;
            previousPayouts = cash.payouts;
            return {
                ...cash,
                cumulativeNet: usdCents(cumulativeNet),
                events: eventsByMonth.get(month) ?? {},
                feesByKind: feesByKind(
                    fees.filter((fee) => isoMonthOf(fee.paidOn) === month),
                ),
                isPartial: month === asOfMonth,
                meetsMultipleTarget: meetsMultipleTarget(
                    payoutMultiple(cash.payouts, cash.spend),
                    cash.payouts,
                    targets.targetMonthlyMultiple,
                ),
                meetsPayoutTarget: meetsPayoutTarget(
                    cash.payouts,
                    targets.monthlyPayoutTargetCents,
                ),
                multiple: payoutMultiple(cash.payouts, cash.spend),
                payoutGrowth: growth,
                trailingThreeMonthMultiple: payoutMultiple(
                    usdCents(sum(trailingPayouts)),
                    usdCents(sum(trailingSpend)),
                ),
            };
        }),
    };
}

export function monthsBetween(from: string, to: string): readonly string[] {
    const [fromYear = 0, fromMonth = 1] = from.split('-').map(Number);
    const [toYear = 0, toMonth = 1] = to.split('-').map(Number);
    const months: string[] = [];
    let year = fromYear;
    let month = fromMonth;
    while (year < toYear || (year === toYear && month <= toMonth)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (!(month > 12)) {
            continue;
        }

        month = 1;
        year += 1;
    }
    return months;
}

function accountTimeline(entry: LedgerAccount): TimelineEntry[] {
    const base = { accountId: entry.row.id, accountLabel: entry.row.label };
    return [
        ...entry.events.map((event) => ({
            ...base,
            eventKind: event.kind,
            id: event.id,
            kind: TimelineEntryKind.Event as const,
            on: event.occurredOn,
        })),
        ...entry.fees.map((fee) => ({
            ...base,
            feeKind: fee.kind,
            id: fee.id,
            kind: TimelineEntryKind.Fee as const,
            on: fee.paidOn,
            signedCents: signedFeeCents(fee),
        })),
        ...entry.payouts.map((payout) => ({
            ...base,
            grossCents: payout.grossCents,
            id: payout.id,
            kind: TimelineEntryKind.Payout as const,
            netCents: payout.netCents,
            on: payout.paidOn ?? payout.requestedOn,
            status: payout.status,
        })),
    ];
}

function meetsMultipleTarget(
    multiple: null | number,
    payouts: UsdCents,
    target: null | number,
): boolean | null {
    return target === null
        ? null
        : multiple === null
          ? payouts > 0
          : multiple >= target;
}

function meetsPayoutTarget(
    payouts: UsdCents,
    target: null | number,
): boolean | null {
    return target === null ? null : payouts >= target;
}

function sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

function timelineRank(kind: TimelineEntryKind): number {
    switch (kind) {
        case TimelineEntryKind.Event: {
            return 0;
        }
        case TimelineEntryKind.Fee: {
            return 1;
        }
        case TimelineEntryKind.Payout: {
            return 2;
        }
    }
}
