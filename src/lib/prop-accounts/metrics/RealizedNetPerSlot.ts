import {
    AccountStage,
    AccountStatus,
    compareText,
    dayNumberOf,
    daysInIsoMonth,
    isoDateOfDay,
    isoMonthOf,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';
import { ratioEstimate } from '~/lib/prop-calculator/stats';

import {
    isTransitionDateKnown,
    type LedgerAccount,
    type LifecycleTransition,
    type PortfolioLedger,
    roundCents,
} from './PortfolioLedger';
import {
    feesOnOrBefore,
    type MonthlyCash,
    monthlyCash,
    paidPayoutsOnOrBefore,
} from './SpendAndPayouts';

export interface CentsEstimate {
    readonly standardError: null | UsdCents;
    readonly value: UsdCents;
}

export interface MonthlySlotNet {
    readonly month: string;
    readonly net: UsdCents;
    readonly netPerSlot: UsdCents;
    readonly slotMonths: number;
}

export interface RealizedNetPerSlot {
    readonly months: readonly MonthlySlotNet[];
    readonly n: number;
    readonly pooled: CentsEstimate | null;
    readonly slotMonths: number;
    readonly unallocatedMonths: number;
    readonly unallocatedNet: UsdCents;
    readonly unmeasuredFundedAccounts: number;
    readonly unmeasuredNet: UsdCents;
    readonly unresolvedAccounts: number;
}

const MIN_MONTHS_FOR_SE = 2;

interface DaySpan {
    readonly fromDay: number;
    readonly toDayExclusive: number;
}

export function realizedNetPerSlot(
    ledger: PortfolioLedger,
    asOf: string,
): RealizedNetPerSlot {
    const endDayExclusive = dayNumberOf(asOf) + 1;
    const measured = ledger.resolvedAccounts.filter(
        (entry) => !hasUnmeasuredSlot(entry),
    );
    const unmeasured = ledger.resolvedAccounts.filter(hasUnmeasuredSlot);
    const slotDays = new Map<string, number>();
    for (const entry of measured) {
        for (const span of activeFundedSpans(entry, endDayExclusive)) {
            addSpanDays(slotDays, span);
        }
    }
    const netByMonth = new Map(
        cashOnOrBefore(measured, asOf).map((cash) => [cash.month, cash.net]),
    );
    const months: MonthlySlotNet[] = [];
    let unallocatedNet = 0;
    let unallocatedMonths = 0;
    for (const month of [
        ...new Set([...netByMonth.keys(), ...slotDays.keys()]),
    ].toSorted(compareText)) {
        const net = netByMonth.get(month) ?? usdCents(0);
        const days = slotDays.get(month) ?? 0;
        if (days === 0) {
            unallocatedNet += net;
            unallocatedMonths += 1;
            continue;
        }
        const slotMonths = days / daysInIsoMonth(month);
        months.push({
            month,
            net,
            netPerSlot: roundCents(net / slotMonths),
            slotMonths,
        });
    }
    return {
        months,
        n: months.length,
        pooled: pooledEstimate(months),
        slotMonths: months.reduce((sum, month) => sum + month.slotMonths, 0),
        unallocatedMonths,
        unallocatedNet: usdCents(unallocatedNet),
        unmeasuredFundedAccounts: unmeasured.length,
        unmeasuredNet: usdCents(
            cashOnOrBefore(unmeasured, asOf).reduce(
                (sum, cash) => sum + cash.net,
                0,
            ),
        ),
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

function activeFundedSpans(
    entry: LedgerAccount,
    endDayExclusive: number,
): readonly DaySpan[] {
    return entry.transitions.flatMap((transition, index) => {
        const next = entry.transitions[index + 1];
        const fromDay = dayNumberOf(transition.on);
        const toDayExclusive = Math.min(
            next === undefined ? endDayExclusive : dayNumberOf(next.on),
            endDayExclusive,
        );
        return isSlotOpening(transition) && toDayExclusive > fromDay
            ? [{ fromDay, toDayExclusive }]
            : [];
    });
}

function addSpanDays(slotDays: Map<string, number>, span: DaySpan): void {
    let day = span.fromDay;
    while (day < span.toDayExclusive) {
        const date = isoDateOfDay(day);
        const month = isoMonthOf(date);
        const monthEndExclusive =
            day + daysInIsoMonth(month) - Number(date.slice(8)) + 1;
        const nextDay = Math.min(monthEndExclusive, span.toDayExclusive);
        slotDays.set(month, (slotDays.get(month) ?? 0) + nextDay - day);
        day = nextDay;
    }
}

function cashOnOrBefore(
    accounts: readonly LedgerAccount[],
    asOf: string,
): readonly MonthlyCash[] {
    return monthlyCash(
        feesOnOrBefore(
            accounts.flatMap((entry) => entry.fees),
            asOf,
        ),
        paidPayoutsOnOrBefore(
            accounts.flatMap((entry) => entry.payouts),
            asOf,
        ),
    );
}

function hasUnmeasuredSlot(entry: LedgerAccount): boolean {
    return entry.transitions.some(
        (transition) =>
            isSlotOpening(transition) &&
            !isTransitionDateKnown(transition.provenance),
    );
}

function isSlotOpening(transition: LifecycleTransition): boolean {
    return (
        transition.to.stage !== AccountStage.Eval &&
        transition.to.status === AccountStatus.Active
    );
}

function pooledEstimate(
    months: readonly MonthlySlotNet[],
): CentsEstimate | null {
    if (months.length === 0) return null;
    const pooled = ratioEstimate(
        months.map((month) => month.net),
        months.map((month) => month.slotMonths),
    );
    return {
        standardError:
            months.length < MIN_MONTHS_FOR_SE
                ? null
                : roundCents(pooled.standardError),
        value: roundCents(pooled.value),
    };
}
