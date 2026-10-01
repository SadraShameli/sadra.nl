import { AccountStage, AccountStatus } from '~/lib/prop-accounts/core';
import {
    accountCapHeadroomFor,
    AccountCapPolicyKind,
    type FirmAccountPolicy,
    type FirmId,
    type SharedPoolPolicy,
    UnverifiedFirmAccountPolicy,
} from '~/lib/prop-calculator';

import { type PlanGroup, type PortfolioLedger } from './PortfolioLedger';

export interface FundedSlotCounts {
    readonly active: number;
    readonly suspended: number;
    readonly used: number;
}

export interface PooledCapPlanRow {
    readonly cap: number;
    readonly firmId: FirmId;
    readonly freeSlots: number;
    readonly isVerified: boolean;
    readonly planLabel: string;
    readonly planSerial: string;
    readonly poolFreeSlots: null | number;
    readonly suspended: number;
    readonly used: number;
}

export interface PooledCapUsage {
    readonly capScopeUnverifiedFirmIds: readonly FirmId[];
    readonly householdDisclosedFirmIds: readonly FirmId[];
    readonly plans: readonly PooledCapPlanRow[];
    readonly pooledCapsModeled: boolean;
}

export function arePooledCapsModeled(ledger: PortfolioLedger): boolean {
    return fundedPlanGroups(ledger).every((group) =>
        isFirmPolicyVerified(group.firm.accountPolicy),
    );
}

export function fundedSlotCountsOf(group: PlanGroup): FundedSlotCounts {
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
    return { active, suspended, used: active + suspended };
}

export function isFirmPolicyVerified(policy: FirmAccountPolicy): boolean {
    return !(policy instanceof UnverifiedFirmAccountPolicy);
}

export function pooledCapUsage(ledger: PortfolioLedger): PooledCapUsage {
    const groups = fundedPlanGroups(ledger);
    const slotCounts = new Map<string, FundedSlotCounts>(
        groups.map((group) => [group.planSerial, fundedSlotCountsOf(group)]),
    );
    const counts = new Map<string, number>(
        [...slotCounts].map(([planSerial, slot]) => [planSerial, slot.used]),
    );
    const byFirm = Map.groupBy(groups, (group) => group.firmId);
    const capScopeUnverifiedFirmIds: FirmId[] = [];
    const householdDisclosedFirmIds: FirmId[] = [];
    const plans: PooledCapPlanRow[] = [];

    for (const [firmId, firmGroups] of byFirm) {
        const [firstGroup] = firmGroups;
        if (firstGroup === undefined) continue;
        const firm = firstGroup.firm;
        const isVerified = isFirmPolicyVerified(firm.accountPolicy);
        if (!isVerified) capScopeUnverifiedFirmIds.push(firmId);
        const pools = new Map<SharedPoolPolicy, PlanGroup[]>();
        const unpooled: PlanGroup[] = [];
        for (const group of firmGroups) {
            const policy = firm.accountPolicy.capPolicyFor(group.plan);
            if (policy.kind !== AccountCapPolicyKind.SharedPool) {
                unpooled.push(group);
                continue;
            }
            if (policy.household) householdDisclosedFirmIds.push(firmId);
            const members = pools.get(policy) ?? [];
            members.push(group);
            pools.set(policy, members);
        }
        for (const [policy, members] of pools) {
            for (const group of members) {
                plans.push(
                    planRow(
                        firmId,
                        group,
                        counts,
                        slotCounts,
                        isVerified,
                        accountCapHeadroomFor(group.plan, policy, counts),
                    ),
                );
            }
        }
        for (const group of unpooled) {
            plans.push(
                planRow(firmId, group, counts, slotCounts, isVerified, null),
            );
        }
    }

    return {
        capScopeUnverifiedFirmIds,
        householdDisclosedFirmIds: [...new Set(householdDisclosedFirmIds)],
        plans,
        pooledCapsModeled: capScopeUnverifiedFirmIds.length === 0,
    };
}

function fundedPlanGroups(ledger: PortfolioLedger): readonly PlanGroup[] {
    return ledger
        .planGroups()
        .filter((group) =>
            group.accounts.some((entry) => entry.row.archivedAt === null),
        );
}

function planRow(
    firmId: FirmId,
    group: PlanGroup,
    counts: ReadonlyMap<string, number>,
    slotCounts: ReadonlyMap<string, FundedSlotCounts>,
    isVerified: boolean,
    poolFreeSlots: null | number,
): PooledCapPlanRow {
    const used = counts.get(group.planSerial) ?? 0;
    const cap = group.firm.maxFundedAccounts(group.plan);
    const perPlanFree = Math.max(0, cap - used);
    return {
        cap,
        firmId,
        freeSlots:
            poolFreeSlots === null
                ? perPlanFree
                : Math.min(perPlanFree, poolFreeSlots),
        isVerified,
        planLabel: group.plan.label,
        planSerial: group.planSerial,
        poolFreeSlots,
        suspended: slotCounts.get(group.planSerial)?.suspended ?? 0,
        used,
    };
}
