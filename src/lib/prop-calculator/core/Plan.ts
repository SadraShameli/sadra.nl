import { type AccountState, createInitialState } from './AccountState';
import { type ConsistencyRule } from './ConsistencyRule';
import { type DrawdownStrategy } from './DrawdownStrategy';
import {
    type CouponDiscounts,
    type FeeSchedule,
    feesUntilPass,
    totalFees,
} from './FeeSchedule';
import { type PayoutTier, walkPayoutTiers } from './PayoutTiers';
import { type PlanId } from './PlanId';

export type PayoutSchedule =
    | { kind: 'daily' }
    | { kind: 'biweekly' }
    | { kind: 'every-n-win-days'; n: number }
    | { kind: 'per-cycle'; days: number };

export interface PlanInit {
    id: PlanId;
    label: string;
    accountSize: number;
    profitTarget: number;
    minTradingDays: number;
    dailyLossLimit: number | null;
    drawdown: DrawdownStrategy;
    consistency: ConsistencyRule | null;
    payoutTiers: readonly PayoutTier[];
    payoutSchedule: PayoutSchedule;
    fees: FeeSchedule;
    minPayoutProfit?: number;
    minDaysAfterPassForPayout?: number;
}

export abstract class Plan {
    constructor(protected readonly init: PlanInit) {}

    get id(): PlanId {
        return this.init.id;
    }
    get label(): string {
        return this.init.label;
    }
    get accountSize(): number {
        return this.init.accountSize;
    }
    get profitTarget(): number {
        return this.init.profitTarget;
    }
    get minTradingDays(): number {
        return this.init.minTradingDays;
    }
    get dailyLossLimit(): number | null {
        return this.init.dailyLossLimit;
    }
    get drawdown(): DrawdownStrategy {
        return this.init.drawdown;
    }
    get consistency(): ConsistencyRule | null {
        return this.init.consistency;
    }
    get payoutTiers(): readonly PayoutTier[] {
        return this.init.payoutTiers;
    }
    get payoutSchedule(): PayoutSchedule {
        return this.init.payoutSchedule;
    }
    get fees(): FeeSchedule {
        return this.init.fees;
    }
    get minPayoutProfit(): number {
        return this.init.minPayoutProfit ?? 0;
    }
    get minDaysAfterPassForPayout(): number {
        return this.init.minDaysAfterPassForPayout ?? 0;
    }

    initialState(): AccountState {
        return createInitialState(
            this.init.accountSize,
            this.init.drawdown.initialThreshold(this.init.accountSize),
        );
    }

    isPassed(state: AccountState): boolean {
        const profit = state.balance - state.startingBalance;
        return (
            profit >= this.init.profitTarget &&
            state.tradingDays >= this.init.minTradingDays
        );
    }

    isBust(state: AccountState): boolean {
        if (this.init.drawdown.isBreached(state)) return true;
        if (
            this.init.dailyLossLimit !== null &&
            state.todayPnL <= -this.init.dailyLossLimit
        ) {
            return true;
        }
        return false;
    }

    feesUntilPass(daysToPass: number, discounts?: CouponDiscounts): number {
        return feesUntilPass(this.init.fees, daysToPass, discounts);
    }

    totalCostThroughDay(
        totalDays: number,
        discounts?: CouponDiscounts,
    ): number {
        return totalFees(this.init.fees, totalDays, discounts);
    }

    payoutFromProfit(fundedProfit: number): number {
        return walkPayoutTiers(this.init.payoutTiers, fundedProfit);
    }
}
