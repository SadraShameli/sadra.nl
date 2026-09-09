import { type FirmId } from './FirmId';
import { type Plan } from './Plan';
import { arePlanIdsEqual, type PlanId } from './PlanId';

export abstract class TradingFirm {
    abstract readonly displayName: string;
    abstract readonly id: FirmId;
    abstract readonly plans: readonly Plan[];
    abstract readonly website: string;

    findPlan(planId: PlanId): Plan | undefined {
        return this.plans.find((p) => arePlanIdsEqual(p.id, planId));
    }

    maxFundedAccounts(plan: Plan): number {
        return plan.maxFundedAccounts;
    }
}

export { FirmId } from './FirmId';
