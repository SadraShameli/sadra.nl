import { type Plan } from '~/lib/prop-calculator/core/Plan';
import { serializePlanId } from '~/lib/prop-calculator/core/PlanId';

export enum AccountCapPolicyKind {
    PerPlan = 'per-plan',
    SharedPool = 'shared-pool',
}

export interface PerPlanCapPolicy {
    readonly kind: AccountCapPolicyKind.PerPlan;
}

export const PER_PLAN_CAP_POLICY: PerPlanCapPolicy = {
    kind: AccountCapPolicyKind.PerPlan,
};

export type AccountCapPolicy = PerPlanCapPolicy | SharedPoolPolicy;

export interface EvalAccountCap {
    readonly count: number;
    readonly household: boolean;
}

export type PlanAccountCounts = ReadonlyMap<string, number>;

export interface PoolPlanCap {
    readonly cap: number;
    readonly planSerial: string;
}

export interface PoolReduction {
    readonly reducedPoolSize: number;
    readonly triggerPlanSerial: string;
}

export interface PurchaseThrottle {
    readonly calendarWindowDays: number;
    readonly count: number;
}

export interface SharedPoolPolicy {
    readonly excludedPlans: readonly PoolPlanCap[];
    readonly household: boolean;
    readonly kind: AccountCapPolicyKind.SharedPool;
    readonly members: readonly string[];
    readonly poolSize: number;
    readonly reduction: null | PoolReduction;
    readonly subCaps: readonly PoolPlanCap[];
}

export function accountCapHeadroomFor(
    plan: Plan,
    policy: AccountCapPolicy,
    counts: PlanAccountCounts,
): number {
    const planSerial = serializePlanId(plan.id);
    if (policy.kind === AccountCapPolicyKind.PerPlan) {
        return Math.max(
            0,
            plan.maxFundedAccounts - countOf(counts, planSerial),
        );
    }
    const headroom = sharedPoolHeadroom(policy, counts).get(planSerial);
    if (headroom === undefined) {
        throw new Error(
            `accountCapHeadroomFor: plan ${planSerial} is not a member of this SharedPoolPolicy`,
        );
    }
    return headroom;
}

export function sharedPoolHeadroom(
    policy: SharedPoolPolicy,
    counts: PlanAccountCounts,
): ReadonlyMap<string, number> {
    const effectivePoolSize =
        policy.reduction !== null &&
        countOf(counts, policy.reduction.triggerPlanSerial) > 0
            ? policy.reduction.reducedPoolSize
            : policy.poolSize;
    const pooledMembers = policy.members.filter((planSerial) =>
        policy.excludedPlans.every(
            (excluded) => excluded.planSerial !== planSerial,
        ),
    );
    const pooledUsed = pooledMembers.reduce(
        (sum, planSerial) => sum + countOf(counts, planSerial),
        0,
    );
    const poolRoom = Math.max(0, effectivePoolSize - pooledUsed);
    const result = new Map<string, number>();
    for (const planSerial of policy.members) {
        const excluded = policy.excludedPlans.find(
            (entry) => entry.planSerial === planSerial,
        );
        if (excluded !== undefined) {
            result.set(
                planSerial,
                Math.max(0, excluded.cap - countOf(counts, planSerial)),
            );
            continue;
        }
        const subCap = policy.subCaps.find(
            (entry) => entry.planSerial === planSerial,
        );
        const subCapRoom =
            subCap === undefined
                ? poolRoom
                : Math.max(0, subCap.cap - countOf(counts, planSerial));
        result.set(planSerial, Math.min(subCapRoom, poolRoom));
    }
    return result;
}

function countOf(counts: PlanAccountCounts, planSerial: string): number {
    return counts.get(planSerial) ?? 0;
}
