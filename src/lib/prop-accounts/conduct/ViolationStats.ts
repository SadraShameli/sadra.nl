import {
    isoMonthOf,
    type RuleViolationKind,
    type UsdCents,
    ViolationSource,
} from '~/lib/prop-accounts/core';

export interface AccountViolationStats {
    readonly accountId: string;
    readonly costCents: number;
    readonly count: number;
}

export interface KindViolationStats {
    readonly costCents: number;
    readonly count: number;
    readonly kind: RuleViolationKind;
}

export interface MonthViolationStats {
    readonly costCents: number;
    readonly count: number;
    readonly month: string;
}

export interface ViolationRecord {
    readonly accountId: string;
    readonly costCents: null | UsdCents;
    readonly kind: RuleViolationKind;
    readonly occurredOn: string;
    readonly source: ViolationSource;
}

export interface ViolationStats {
    readonly byAccount: readonly AccountViolationStats[];
    readonly byKind: readonly KindViolationStats[];
    readonly byMonth: readonly MonthViolationStats[];
    readonly detectedCount: number;
    readonly disclosures: readonly string[];
    readonly manualCount: number;
    readonly netCostCents: number;
    readonly netCostShareOfNetCash: null | number;
    readonly uncostedCount: number;
}

const NO_RECORDED_COST_DISCLOSURE =
    'A violation with no recorded cost counts toward its count only, never its cost total.';

export function violationStatsOf(
    violations: readonly ViolationRecord[],
    netCashCents: null | UsdCents,
): ViolationStats {
    const byAccount = new Map<string, AccountViolationStats>();
    const byKind = new Map<RuleViolationKind, KindViolationStats>();
    const byMonth = new Map<string, MonthViolationStats>();
    let netCostCents = 0;
    let manualCount = 0;
    let detectedCount = 0;
    let uncostedCount = 0;

    for (const violation of violations) {
        const cost = violation.costCents ?? 0;
        if (violation.costCents === null) uncostedCount += 1;
        netCostCents += cost;
        if (violation.source === ViolationSource.Manual) {
            manualCount += 1;
        } else {
            detectedCount += 1;
        }
        addAccount(byAccount, violation.accountId, cost);
        addKind(byKind, violation.kind, cost);
        addMonth(byMonth, isoMonthOf(violation.occurredOn), cost);
    }

    return {
        byAccount: byAccount.values().toArray(),
        byKind: byKind.values().toArray(),
        byMonth: byMonth.values().toArray(),
        detectedCount,
        disclosures: uncostedCount === 0 ? [] : [NO_RECORDED_COST_DISCLOSURE],
        manualCount,
        netCostCents,
        netCostShareOfNetCash:
            violations.length === 0
                ? null
                : shareOf(netCostCents, netCashCents),
        uncostedCount,
    };
}

function addAccount(
    byAccount: Map<string, AccountViolationStats>,
    accountId: string,
    cost: number,
): void {
    const existing = byAccount.get(accountId);
    byAccount.set(accountId, {
        accountId,
        costCents: (existing?.costCents ?? 0) + cost,
        count: (existing?.count ?? 0) + 1,
    });
}

function addKind(
    byKind: Map<RuleViolationKind, KindViolationStats>,
    kind: RuleViolationKind,
    cost: number,
): void {
    const existing = byKind.get(kind);
    byKind.set(kind, {
        costCents: (existing?.costCents ?? 0) + cost,
        count: (existing?.count ?? 0) + 1,
        kind,
    });
}

function addMonth(
    byMonth: Map<string, MonthViolationStats>,
    month: string,
    cost: number,
): void {
    const existing = byMonth.get(month);
    byMonth.set(month, {
        costCents: (existing?.costCents ?? 0) + cost,
        count: (existing?.count ?? 0) + 1,
        month,
    });
}

function shareOf(
    netCostCents: number,
    netCashCents: null | UsdCents,
): null | number {
    return netCashCents === null || netCashCents <= 0
        ? null
        : netCostCents / netCashCents;
}
