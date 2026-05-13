import { FirmId } from './FirmId';
import { type Plan } from './Plan';
import { type PlanId, planIdEquals } from './PlanId';

export { FirmId };

export abstract class PropFirm {
    abstract readonly id: FirmId;
    abstract readonly displayName: string;
    abstract readonly website: string;
    abstract readonly plans: readonly Plan[];

    findPlan(planId: PlanId): Plan | undefined {
        return this.plans.find((p) => planIdEquals(p.id, planId));
    }

    abstract maxFundedAccounts(plan: Plan): number;
}
