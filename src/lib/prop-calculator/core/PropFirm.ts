import { type FirmId } from './FirmId';
import { type Plan } from './Plan';
import { type PlanId, planIdEquals } from './PlanId';

export abstract class PropFirm {
    abstract readonly displayName: string;
    abstract readonly id: FirmId;
    abstract readonly plans: readonly Plan[];
    abstract readonly website: string;

    findPlan(planId: PlanId): Plan | undefined {
        return this.plans.find((p) => planIdEquals(p.id, planId));
    }

    abstract maxFundedAccounts(plan: Plan): number;
}

export { FirmId } from './FirmId';
