import {
    AccountEventKind,
    FeeKind,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    isoMonthOf,
} from '~/lib/prop-accounts/core';
import { RetryKind } from '~/lib/prop-calculator';

import { earliestActivityMonth, filledMonths } from './MonthlyStatement';
import { type LedgerAccount, type PortfolioLedger } from './PortfolioLedger';

export interface AttemptThroughput {
    readonly meanPerActiveFirmPerMonth: null | number;
    readonly meanPerMonth: number;
    readonly months: readonly MonthlyAttempts[];
    readonly perFirm: readonly FirmMonthlyAttempts[];
}

export interface FirmMonthlyAttempts {
    readonly firmKey: FirmKey;
    readonly months: readonly MonthlyAttempts[];
}

export interface MonthlyAttempts {
    readonly attempts: number;
    readonly month: string;
}

export function attemptThroughput(
    ledger: PortfolioLedger,
    asOf: string,
): AttemptThroughput {
    const accounts = ledger.resolvedAccounts;
    const months = filledMonths(
        earliestActivityMonth(ledger),
        isoMonthOf(asOf),
    );
    const overall = monthlyCounts(accounts, months);
    const perFirm = groupByFirmKey(accounts, (entry) =>
        firmKeyOf(entry.row),
    ).map(({ firmKey, items }) => ({
        firmKey,
        months: monthlyCounts(items, months),
    }));
    const activeFirms = perFirm.filter((firm) =>
        firm.months.some((month) => month.attempts > 0),
    );
    const activeFirmMonths = activeFirms.reduce(
        (sum, firm) => sum + firm.months.length,
        0,
    );
    const totalActiveFirmAttempts = activeFirms.reduce(
        (sum, firm) =>
            sum + firm.months.reduce((s, month) => s + month.attempts, 0),
        0,
    );
    return {
        meanPerActiveFirmPerMonth:
            activeFirmMonths === 0
                ? null
                : totalActiveFirmAttempts / activeFirmMonths,
        meanPerMonth:
            months.length === 0
                ? 0
                : overall.reduce((sum, month) => sum + month.attempts, 0) /
                  months.length,
        months: overall,
        perFirm,
    };
}

function attemptDatesOf(entry: LedgerAccount): readonly string[] {
    const lifecycleDates = entry.events
        .filter(
            (event) =>
                event.kind === AccountEventKind.Purchased ||
                event.kind === AccountEventKind.Reopened,
        )
        .map((event) => event.occurredOn);
    const isRetriesByFee = entry.plan?.plan.fees.retry === RetryKind.Rebuy;
    const lifecycleDateSet = new Set(lifecycleDates);
    const extraFeeDates = isRetriesByFee
        ? entry.fees
              .filter((fee) => fee.kind === FeeKind.Rebuy)
              .map((fee) => fee.paidOn)
              .filter((date) => !lifecycleDateSet.has(date))
        : [];
    return [...lifecycleDates, ...extraFeeDates];
}

function monthlyCounts(
    accounts: readonly LedgerAccount[],
    months: readonly string[],
): readonly MonthlyAttempts[] {
    const counts = new Map<string, number>();
    for (const entry of accounts) {
        for (const date of attemptDatesOf(entry)) {
            const month = isoMonthOf(date);
            counts.set(month, (counts.get(month) ?? 0) + 1);
        }
    }
    return months.map((month) => ({
        attempts: counts.get(month) ?? 0,
        month,
    }));
}
