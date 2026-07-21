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
    readonly accountSize: number;

    readonly consistency: ConsistencyRule | null;

    readonly dailyLossLimit: null | number;

    readonly drawdown: DrawdownStrategy;

    readonly fees: FeeSchedule;

    readonly id: PlanId;

    readonly label: string;

    readonly minDaysAfterPassForPayout: number;

    readonly minPayoutProfit: number;

    readonly minTradingDays: number;

    readonly payoutSchedule: PayoutSchedule;

    readonly payoutTiers: readonly PayoutTier[];

    readonly profitTarget: number;

    constructor(protected readonly init: PlanInit) {
        this.accountSize = init.accountSize;
        this.consistency = init.consistency;
        this.dailyLossLimit = init.dailyLossLimit;
        this.drawdown = init.drawdown;
        this.fees = init.fees;
        this.id = init.id;
        this.label = init.label;
        this.minDaysAfterPassForPayout = init.minDaysAfterPassForPayout ?? 0;
        this.minPayoutProfit = init.minPayoutProfit ?? 0;
        this.minTradingDays = init.minTradingDays;
        this.payoutSchedule = init.payoutSchedule;
        this.payoutTiers = init.payoutTiers;
        this.profitTarget = init.profitTarget;
    }

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
        return (
            this.init.dailyLossLimit !== null &&
            state.todayPnL <= -this.init.dailyLossLimit
        );
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
