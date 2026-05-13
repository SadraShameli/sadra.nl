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
    | { days: number; kind: 'per-cycle' }
    | { kind: 'biweekly' }
    | { kind: 'daily' }
    | { kind: 'every-n-win-days'; n: number };

export interface PlanInit {
    accountSize: number;
    consistency: ConsistencyRule | null;
    dailyLossLimit: null | number;
    drawdown: DrawdownStrategy;
    fees: FeeSchedule;
    id: PlanId;
    label: string;
    minDaysAfterPassForPayout?: number;
    minPayoutProfit?: number;
    minTradingDays: number;
    payoutSchedule: PayoutSchedule;
    payoutTiers: readonly PayoutTier[];
    profitTarget: number;
}

export abstract class Plan {
    get accountSize(): number {
        return this.init.accountSize;
    }

    get consistency(): ConsistencyRule | null {
        return this.init.consistency;
    }
    get dailyLossLimit(): null | number {
        return this.init.dailyLossLimit;
    }
    get drawdown(): DrawdownStrategy {
        return this.init.drawdown;
    }
    get fees(): FeeSchedule {
        return this.init.fees;
    }
    get id(): PlanId {
        return this.init.id;
    }
    get label(): string {
        return this.init.label;
    }
    get minDaysAfterPassForPayout(): number {
        return this.init.minDaysAfterPassForPayout ?? 0;
    }
    get minPayoutProfit(): number {
        return this.init.minPayoutProfit ?? 0;
    }
    get minTradingDays(): number {
        return this.init.minTradingDays;
    }
    get payoutSchedule(): PayoutSchedule {
        return this.init.payoutSchedule;
    }
    get payoutTiers(): readonly PayoutTier[] {
        return this.init.payoutTiers;
    }
    get profitTarget(): number {
        return this.init.profitTarget;
    }
    constructor(protected readonly init: PlanInit) {}

    feesUntilPass(daysToPass: number, discounts?: CouponDiscounts): number {
        return feesUntilPass(this.init.fees, daysToPass, discounts);
    }

    initialState(): AccountState {
        return createInitialState(
            this.init.accountSize,
            this.init.drawdown.initialThreshold(this.init.accountSize),
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

    isPassed(state: AccountState): boolean {
        const profit = state.balance - state.startingBalance;
        return (
            profit >= this.init.profitTarget &&
            state.tradingDays >= this.init.minTradingDays
        );
    }

    payoutFromProfit(fundedProfit: number): number {
        return walkPayoutTiers(this.init.payoutTiers, fundedProfit);
    }

    totalCostThroughDay(
        totalDays: number,
        discounts?: CouponDiscounts,
    ): number {
        return totalFees(this.init.fees, totalDays, discounts);
    }
}
