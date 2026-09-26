import { type FirmId } from './FirmId';
import { Plan, type PlanInit } from './Plan';
import { arePlanIdsEqual, type PlanId, serializePlanId } from './PlanId';

class ConcretePlan extends Plan {}

export abstract class TradingFirm {
    abstract readonly displayName: string;
    abstract readonly id: FirmId;
    abstract readonly plans: readonly Plan[];
    abstract readonly website: string;
    readonly notes: readonly string[] = [];

    protected buildPlan(init: PlanInit): Plan {
        return new ConcretePlan(init);
    }

    findPlan(planId: PlanId): Plan | undefined {
        return this.plans.find((p) => arePlanIdsEqual(p.id, planId));
    }

    findPlanBySerial(serial: string): null | Plan {
        return this.plans.find((p) => serializePlanId(p.id) === serial) ?? null;
    }

    maxFundedAccounts(plan: Plan): number {
        return plan.maxFundedAccounts;
    }
}

export { FirmId } from './FirmId';
