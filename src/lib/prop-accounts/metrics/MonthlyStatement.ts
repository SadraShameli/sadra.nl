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
import {
    ledgerFees,
    ledgerPayouts,
    type MonthlyCash,
    monthlyCash,
    summarizeCash,
} from './SpendAndPayouts';

export enum TimelineEntryKind {
    Event = 'event',
    Fee = 'fee',
    Payout = 'payout',
}

export interface MonthlyStatement {
    readonly months: readonly StatementMonth[];
}

export interface StatementMonth extends MonthlyCash {
    readonly cumulativeNet: UsdCents;
    readonly events: Readonly<Partial<Record<AccountEventKind, number>>>;
    readonly feesByKind: Readonly<Record<FeeKind, UsdCents>>;
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

export function monthlyStatement(ledger: PortfolioLedger): MonthlyStatement {
    const fees = ledgerFees(ledger);
    const cashByMonth = new Map(
        monthlyCash(fees, ledgerPayouts(ledger)).map((cash) => [
            cash.month,
            cash,
        ]),
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
    let cumulativeNet = 0;
    return {
        months: [...new Set([...cashByMonth.keys(), ...eventsByMonth.keys()])]
            .toSorted(compareText)
            .map((month) => {
                const cash = cashByMonth.get(month) ?? {
                    month,
                    ...summarizeCash([], []),
                };
                cumulativeNet += cash.net;
                return {
                    ...cash,
                    cumulativeNet: usdCents(cumulativeNet),
                    events: eventsByMonth.get(month) ?? {},
                    feesByKind: feesByKind(
                        fees.filter((fee) => isoMonthOf(fee.paidOn) === month),
                    ),
                };
            }),
    };
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
