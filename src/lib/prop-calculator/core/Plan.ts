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
import { type Dollars, dollars, type Fraction0to1 } from './units';

export type ConsistencyOverride =
    { kind: 'inherit' } | { kind: 'set'; rule: ConsistencyRule | null };

export interface PlanInit {
    accountSize: Dollars;
    consistency: ConsistencyRule | null;
    contractLimits?: ContractLimits;
    drawdown: DrawdownStrategy;
    evalDailyLossLimit: DailyLossLimitConfig;
    fees: FeeSchedule;
    fundedConsistency?: ConsistencyOverride;
    fundedDailyLossLimit?: DailyLossLimitConfig;
    fundedDrawdown?: DrawdownStrategy;
    id: PlanId;
    label: string;
    maxFundedAccounts: number;
    minDaysAfterPassForPayout?: number;
    minPayoutProfit?: Dollars;
    minPayoutProfitPerCycle?: Dollars;
    minPayoutRequest?: Dollars;
    minQualifyingDayProfit?: Dollars | null;
    minTradingDays: number;
    payoutBalanceShareCap?: Fraction0to1;
    payoutLadder?: null | PayoutLadder;
    payoutProfitShare?: Fraction0to1;
    payoutRequestCap?: Dollars;
    payoutResetsLossLimit?: boolean;
    payoutTiers: readonly PayoutTier[];
    payoutTriggersLock?: boolean;
    profitTarget: Dollars;
}

export abstract class Plan {
    readonly accountSize: Dollars;

    readonly consistency: ConsistencyRule | null;

    readonly contractLimits: ContractLimits | null;

    readonly drawdown: DrawdownStrategy;

    readonly evalDailyLossLimit: DailyLossLimitConfig;

    readonly fees: FeeSchedule;

    readonly fundedDailyLossLimit: DailyLossLimitConfig;

    readonly fundedDrawdown: DrawdownStrategy;

    readonly id: PlanId;

    readonly label: string;

    readonly maxFundedAccounts: number;

    readonly minDaysAfterPassForPayout: number;

    readonly minPayoutProfit: Dollars;

    readonly minPayoutProfitPerCycle: Dollars | null;

    readonly minPayoutRequest: Dollars;

    readonly minQualifyingDayProfit: Dollars | null;

    readonly minTradingDays: number;

    readonly payoutBalanceShareCap: Fraction0to1 | null;

    readonly payoutLadder: null | PayoutLadder;

    readonly payoutProfitShare: Fraction0to1 | null;

    readonly payoutRequestCap: Dollars | null;

    readonly payoutResetsLossLimit: boolean;

    readonly payoutTiers: readonly PayoutTier[];

    readonly payoutTriggersLock: boolean;

    readonly profitTarget: Dollars;

    constructor(protected readonly init: PlanInit) {
        this.accountSize = init.accountSize;
        this.consistency = init.consistency;
        this.contractLimits = init.contractLimits ?? null;
        this.drawdown = init.drawdown;
        this.evalDailyLossLimit = init.evalDailyLossLimit;
        this.fees = init.fees;
        this.fundedDailyLossLimit =
            init.fundedDailyLossLimit ?? init.evalDailyLossLimit;
        this.fundedDrawdown = init.fundedDrawdown ?? init.drawdown;
        this.id = init.id;
        this.label = init.label;
        this.maxFundedAccounts = init.maxFundedAccounts;
        this.minDaysAfterPassForPayout = init.minDaysAfterPassForPayout ?? 0;
        this.minPayoutProfit = init.minPayoutProfit ?? dollars(0);
        this.minPayoutProfitPerCycle = init.minPayoutProfitPerCycle ?? null;
        this.minPayoutRequest =
            init.minPayoutRequest ?? init.minPayoutProfit ?? dollars(0);
        this.minQualifyingDayProfit = init.minQualifyingDayProfit ?? null;
        this.minTradingDays = init.minTradingDays;
        this.payoutBalanceShareCap = init.payoutBalanceShareCap ?? null;
        this.payoutLadder = init.payoutLadder ?? null;
        this.payoutProfitShare = init.payoutProfitShare ?? null;
        this.payoutRequestCap = init.payoutRequestCap ?? null;
        this.payoutResetsLossLimit = init.payoutResetsLossLimit ?? false;
        this.payoutTiers = init.payoutTiers;
        this.payoutTriggersLock = init.payoutTriggersLock ?? false;
        this.profitTarget = init.profitTarget;
    }

    drawdownFor(phase: 'eval' | 'funded'): DrawdownStrategy {
        return phase === 'funded' ? this.fundedDrawdown : this.drawdown;
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
        if (this.drawdownFor(phase).isBreached(state)) return true;

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

    evalConsistencyRule(): ConsistencyRule | null {
        const rule = this.init.consistency;
        return rule?.appliesToEval() ? rule : null;
    }

    fundedConsistencyRule(): ConsistencyRule | null {
        const override = this.init.fundedConsistency;
        if (override?.kind === 'set') {
            return override.rule;
        }
        const rule = this.init.consistency;
        return rule?.appliesToFunded() ? rule : null;
    }

    isPassed(state: AccountState): boolean {
        const profit = state.balance - state.startingBalance;
        if (profit < this.init.profitTarget) return false;
        if (state.tradingDays < this.init.minTradingDays) return false;
        const consistency = this.evalConsistencyRule();
        return !consistency?.isViolated(state.bestDayProfit, profit);
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
