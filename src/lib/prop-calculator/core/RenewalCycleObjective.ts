import { TRADING_DAYS_PER_MONTH } from './constants';
import {
    type CouponDiscounts,
    monthlySubscriptionFee,
    RetryKind,
    retryPath,
} from './FeeSchedule';
import { type Plan } from './Plan';

export interface RenewalCycleObjectiveInit {
    copyAccounts?: number;
    discounts?: CouponDiscounts;
    fundedHorizonDays: number;
    maxEvalDays: number;
    plan: Plan;
    rebuyLagDays: number;
}

export class RenewalCycleObjective {
    readonly copyAccounts: number;

    readonly discounts: CouponDiscounts | undefined;

    readonly fundedHorizonDays: number;

    readonly maxEvalDays: number;

    readonly plan: Plan;

    readonly purchaseDiscounts: CouponDiscounts | undefined;

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
        const copyAccounts = init.copyAccounts ?? 1;
        if (!Number.isSafeInteger(copyAccounts) || copyAccounts < 1) {
            throw new Error(
                `RenewalCycleObjective requires copyAccounts to be a positive integer, got ${copyAccounts}`,
            );
        }
        this.copyAccounts = copyAccounts;
        this.discounts = init.discounts;
        this.fundedHorizonDays = init.fundedHorizonDays;
        this.maxEvalDays = init.maxEvalDays;
        this.plan = init.plan;
        this.rebuyLagDays = init.rebuyLagDays;
        this.purchaseDiscounts = init.plan.purchaseDiscounts(
            init.discounts,
            copyAccounts,
        );
    }

    private unbilledSubscriptionAfterReset(failedAttemptDays: number): number {
        if (retryPath(this.plan.fees, this.discounts) === RetryKind.Rebuy) {
            return 0;
        }
        const usedMonths = failedAttemptDays / TRADING_DAYS_PER_MONTH;
        const billedDuringAttempt =
            this.plan.feesUntilPass(failedAttemptDays, this.discounts) -
            this.plan.feesUntilPass(0, this.discounts);
        return (
            monthlySubscriptionFee(this.plan.fees, this.discounts) *
                usedMonths -
            billedDuringAttempt
        );
    }

    activationCost(): number {
        return (
            this.plan.totalCostThroughDay(0, this.purchaseDiscounts) -
            this.plan.feesUntilPass(0, this.purchaseDiscounts)
        );
    }

    entryCost(ratePerDay: number): number {
        return (
            this.plan.feesUntilPass(0, this.purchaseDiscounts) +
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

    retryCost(ratePerDay: number, failedAttemptDays: number): number {
        return (
            this.plan.retryFee(this.discounts) +
            this.unbilledSubscriptionAfterReset(failedAttemptDays) +
            ratePerDay * this.rebuyLagDays
        );
    }
}
