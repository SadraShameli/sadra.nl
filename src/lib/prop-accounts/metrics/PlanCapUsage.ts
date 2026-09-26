import { AccountStage, AccountStatus } from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';

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
    readonly pooledCapsModeled: false;
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
        pooledCapsModeled: false,
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

function capRow(group: PlanGroup): PlanCapRow {
    const funded = group.accounts.filter(
        (entry) =>
            entry.row.archivedAt === null &&
            entry.row.stage === AccountStage.Funded,
    );
    const active = funded.filter(
        (entry) => entry.row.status === AccountStatus.Active,
    ).length;
    const suspended = funded.filter(
        (entry) => entry.row.status === AccountStatus.Suspended,
    ).length;
    const used = active + suspended;
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
