import { type AccountState, createInitialState } from './AccountState';
import { type ConsistencyRule } from './ConsistencyRule';
import { type ContractLimits } from './ContractLimits';
import {
    type DailyLossLimitConfig,
    resolveDailyLossLimit,
} from './DailyLossLimit';
import { type DrawdownStrategy } from './DrawdownStrategy';
import {
    type CouponDiscounts,
    type FeeSchedule,
    feesUntilPass,
    totalFees,
} from './FeeSchedule';
import {
    type PayoutLadder,
    type PayoutTier,
    walkPayoutTiers,
} from './PayoutTiers';
import { type PlanId } from './PlanId';

export type PayoutSchedule =
    | { days: number; kind: 'per-cycle' }
    | { kind: 'biweekly' }
    | { kind: 'daily' }
    | { kind: 'event-driven' }
    | { kind: 'every-n-win-days'; n: number };

export interface PlanInit {
    accountSize: number;
    consistency: ConsistencyRule | null;
    contractLimits?: ContractLimits;
    drawdown: DrawdownStrategy;
    evalDailyLossLimit: DailyLossLimitConfig;
    fees: FeeSchedule;
    fundedDailyLossLimit?: DailyLossLimitConfig;
    id: PlanId;
    label: string;
    minDaysAfterPassForPayout?: number;
    minPayoutProfit?: number;
    minPayoutRequest?: number;
    minQualifyingDayProfit?: null | number;
    minTradingDays: number;
    payoutLadder?: null | PayoutLadder;
    payoutProfitShare?: number;
    payoutSchedule: PayoutSchedule;
    payoutTiers: readonly PayoutTier[];
    profitTarget: number;
}

export abstract class Plan {
    readonly accountSize: number;

    readonly consistency: ConsistencyRule | null;

    readonly contractLimits: ContractLimits | null;

    readonly drawdown: DrawdownStrategy;

    readonly evalDailyLossLimit: DailyLossLimitConfig;

    readonly fees: FeeSchedule;

    readonly fundedDailyLossLimit: DailyLossLimitConfig;

    readonly id: PlanId;

    readonly label: string;

    readonly minDaysAfterPassForPayout: number;

    readonly minPayoutProfit: number;

    readonly minPayoutRequest: number;

    readonly minQualifyingDayProfit: null | number;

    readonly minTradingDays: number;

    readonly payoutLadder: null | PayoutLadder;

    readonly payoutProfitShare: null | number;

    readonly payoutSchedule: PayoutSchedule;

    readonly payoutTiers: readonly PayoutTier[];

    readonly profitTarget: number;

    constructor(protected readonly init: PlanInit) {
        this.accountSize = init.accountSize;
        this.consistency = init.consistency;
        this.contractLimits = init.contractLimits ?? null;
        this.drawdown = init.drawdown;
        this.evalDailyLossLimit = init.evalDailyLossLimit;
        this.fees = init.fees;
        this.fundedDailyLossLimit =
            init.fundedDailyLossLimit ?? init.evalDailyLossLimit;
        this.id = init.id;
        this.label = init.label;
        this.minDaysAfterPassForPayout = init.minDaysAfterPassForPayout ?? 0;
        this.minPayoutProfit = init.minPayoutProfit ?? 0;
        this.minPayoutRequest =
            init.minPayoutRequest ?? init.minPayoutProfit ?? 0;
        this.minQualifyingDayProfit = init.minQualifyingDayProfit ?? null;
        this.minTradingDays = init.minTradingDays;
        this.payoutLadder = init.payoutLadder ?? null;
        this.payoutProfitShare = init.payoutProfitShare ?? null;
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

    isBust(state: AccountState, phase: 'eval' | 'funded'): boolean {
        if (this.init.drawdown.isBreached(state)) return true;

        if (phase === 'eval') {
            const profit = state.balance - state.startingBalance;
            const limit = resolveDailyLossLimit(
                this.evalDailyLossLimit,
                profit,
            );
            return limit !== null && state.todayPnL <= -limit;
        }

        const profit = state.balance - state.fundingBaseline;
        const limit = resolveDailyLossLimit(this.fundedDailyLossLimit, profit);
        return limit !== null && state.todayPnL <= -limit;
    }

    isPassed(state: AccountState): boolean {
        const profit = state.balance - state.startingBalance;
        if (profit < this.init.profitTarget) return false;
        if (state.tradingDays < this.init.minTradingDays) return false;
        const consistency = this.init.consistency;
        return !(
            consistency?.appliesToEval() &&
            consistency.isViolated(state.bestDayProfit, profit)
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
