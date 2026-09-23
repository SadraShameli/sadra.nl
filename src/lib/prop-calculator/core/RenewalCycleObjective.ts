import { TRADING_DAYS_PER_MONTH } from './constants';
import { type CouponDiscounts } from './FeeSchedule';
import { type Plan } from './Plan';

export interface RenewalCycleObjectiveInit {
    discounts?: CouponDiscounts;
    fundedHorizonDays: number;
    maxEvalDays: number;
    plan: Plan;
    rebuyLagDays: number;
}

export class RenewalCycleObjective {
    readonly discounts: CouponDiscounts | undefined;

    readonly fundedHorizonDays: number;

    readonly maxEvalDays: number;

    readonly plan: Plan;

    readonly rebuyLagDays: number;

    constructor(init: RenewalCycleObjectiveInit) {
        if (
            !Number.isFinite(init.fundedHorizonDays) ||
            init.fundedHorizonDays < 1
        ) {
            throw new Error(
                `RenewalCycleObjective requires fundedHorizonDays >= 1, got ${init.fundedHorizonDays}`,
            );
        }
        if (!Number.isFinite(init.rebuyLagDays) || init.rebuyLagDays < 0) {
            throw new Error(
                `RenewalCycleObjective requires rebuyLagDays >= 0 and finite, got ${init.rebuyLagDays}`,
            );
        }
        this.discounts = init.discounts;
        this.fundedHorizonDays = init.fundedHorizonDays;
        this.maxEvalDays = init.maxEvalDays;
        this.plan = init.plan;
        this.rebuyLagDays = init.rebuyLagDays;
    }

    activationCost(): number {
        return (
            this.plan.totalCostThroughDay(0, this.discounts) -
            this.plan.feesUntilPass(0, this.discounts)
        );
    }

    entryCost(ratePerDay: number): number {
        return (
            this.plan.feesUntilPass(0, this.discounts) +
            ratePerDay * this.rebuyLagDays
        );
    }

    evalDayCost(ratePerDay: number, day: number): number {
        return (
            ratePerDay +
            this.plan.feesUntilPass(day + 1, this.discounts) -
            this.plan.feesUntilPass(day, this.discounts)
        );
    }

    fundedDayCost(ratePerDay: number): number {
        return ratePerDay;
    }

    maxExpectedCycleDays(): number {
        return (
            this.plan.evalDayCap(this.maxEvalDays) +
            this.fundedHorizonDays +
            this.rebuyLagDays
        );
    }

    minCycleDays(): number {
        return 1 + this.rebuyLagDays;
    }

    monthlyRate(ratePerDay: number): number {
        return ratePerDay * TRADING_DAYS_PER_MONTH;
    }
}
