import { type FirmId } from '~/lib/prop-calculator';

import { arePooledCapsModeled, fundedSlotCountsOf } from './PooledCapUsage';
import { type PlanGroup, type PortfolioLedger } from './PortfolioLedger';

export interface PlanCapRow {
    readonly cap: number;
    readonly firmId: FirmId;
    readonly freeSlots: number;
    readonly overCap: boolean;
    readonly planLabel: string;
    readonly planSerial: string;
    readonly suspended: number;
    readonly used: number;
}

export interface PlanCapUsage {
    readonly ledgerOnlyAccounts: number;
    readonly plans: readonly PlanCapRow[];
    readonly pooledCapsModeled: boolean;
    readonly unresolvedAccounts: number;
}

export function planCapUsage(ledger: PortfolioLedger): PlanCapUsage {
    return {
        ledgerOnlyAccounts: ledger.ledgerOnlyAccounts.length,
        plans: ledger
            .planGroups()
            .filter((group) =>
                group.accounts.some((entry) => entry.row.archivedAt === null),
            )
            .map((group) => capRow(group)),
        pooledCapsModeled: arePooledCapsModeled(ledger),
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

export function totalUsedFundedSlots(usage: PlanCapUsage): number {
    return usage.plans.reduce((sum, row) => sum + row.used, 0);
}

function capRow(group: PlanGroup): PlanCapRow {
    const { suspended, used } = fundedSlotCountsOf(group);
    const cap = group.firm.maxFundedAccounts(group.plan);
    return {
        cap,
        firmId: group.firmId,
        freeSlots: Math.max(0, cap - used),
        overCap: used > cap,
        planLabel: group.plan.label,
        planSerial: group.planSerial,
        suspended,
        used,
    };
}
