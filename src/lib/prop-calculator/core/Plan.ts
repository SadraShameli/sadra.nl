import {
    type AccountState,
    createInitialState,
    resetForNewDay,
} from './AccountState';
import { ConsistencyRule, ConsistencyScope } from './ConsistencyRule';
import { type ContractLimits } from './ContractLimits';
import {
    type DailyLossLimitConfig,
    type DailyLossLimitContext,
    resolveDailyLossLimit,
} from './DailyLossLimit';
import { type DrawdownStrategy } from './DrawdownStrategy';
import {
    type CouponDiscounts,
    type FeeSchedule,
    feesUntilPass,
    totalFees,
} from './FeeSchedule';
import { type PayoutBuffer } from './PayoutBuffer';
import {
    type PayoutLadder,
    type PayoutTier,
    walkPayoutTiers,
} from './PayoutTiers';
import { type PlanId } from './PlanId';
import { TradingPhase } from './TradingPhase';
import { type Dollars, dollars, type Fraction0to1 } from './units';

export interface ConsistencyLadder {
    steps: readonly Fraction0to1[];
}

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
    fundedConsistencyLadder?: ConsistencyLadder;
    fundedDailyLossLimit?: DailyLossLimitConfig;
    fundedDrawdown?: DrawdownStrategy;
    id: PlanId;
    label: string;
    maxFundedAccounts: number;
    maxLifetimePayouts?: number;
    minDaysAfterPassForPayout?: number;
    minPayoutProfit?: Dollars;
    minPayoutProfitPerCycle?: Dollars;
    minPayoutRequest?: Dollars;
    minQualifyingDayProfit?: Dollars | null;
    minTradingDays: number;
    payoutBalanceShareCap?: Fraction0to1;
    payoutBuffer?: PayoutBuffer;
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

    readonly maxLifetimePayouts: null | number;

    readonly minDaysAfterPassForPayout: number;

    readonly minPayoutProfit: Dollars;

    readonly minPayoutProfitPerCycle: Dollars | null;

    readonly minPayoutRequest: Dollars;

    readonly minQualifyingDayProfit: Dollars | null;

    readonly minTradingDays: number;

    readonly payoutBalanceShareCap: Fraction0to1 | null;

    readonly payoutBuffer: null | PayoutBuffer;

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
        this.maxLifetimePayouts = init.maxLifetimePayouts ?? null;
        this.minDaysAfterPassForPayout = init.minDaysAfterPassForPayout ?? 0;
        this.minPayoutProfit = init.minPayoutProfit ?? dollars(0);
        this.minPayoutProfitPerCycle = init.minPayoutProfitPerCycle ?? null;
        this.minPayoutRequest =
            init.minPayoutRequest ?? init.minPayoutProfit ?? dollars(0);
        this.minQualifyingDayProfit = init.minQualifyingDayProfit ?? null;
        this.minTradingDays = init.minTradingDays;
        this.payoutBalanceShareCap = init.payoutBalanceShareCap ?? null;
        this.payoutBuffer = init.payoutBuffer ?? null;
        this.payoutLadder = init.payoutLadder ?? null;
        this.payoutProfitShare = init.payoutProfitShare ?? null;
        this.payoutRequestCap = init.payoutRequestCap ?? null;
        this.payoutResetsLossLimit = init.payoutResetsLossLimit ?? false;
        this.payoutTiers = init.payoutTiers;
        this.payoutTriggersLock = init.payoutTriggersLock ?? false;
        this.profitTarget = init.profitTarget;
    }

    accountProfit(state: AccountState): number {
        return state.balance - state.startingBalance;
    }

    beginFundedPhase(state: AccountState): void {
        state.balance = this.accountSize;
        state.bestDayProfit = 0;
        state.fundingBaseline = this.accountSize;
        state.peakDayCloseProfit = 0;
        state.qualifyingDays = 0;
        state.threshold = this.fundedDrawdown.initialThreshold(
            this.accountSize,
        );
        state.thresholdLocked = false;
        state.tradingDays = 0;
        resetForNewDay(state);
    }

    dailyLossLimitFor(phase: TradingPhase): DailyLossLimitConfig {
        return phase === TradingPhase.Funded
            ? this.fundedDailyLossLimit
            : this.evalDailyLossLimit;
    }

    drawdownFor(phase: TradingPhase): DrawdownStrategy {
        return phase === TradingPhase.Funded
            ? this.fundedDrawdown
            : this.drawdown;
    }

    profitFor(state: AccountState, phase: TradingPhase): number {
        return phase === TradingPhase.Funded
            ? state.balance - state.fundingBaseline
            : this.accountProfit(state);
    }

    recordDayClosePeak(state: AccountState): void {
        const profit = this.accountProfit(state);
        if (profit > state.peakDayCloseProfit) {
            state.peakDayCloseProfit = profit;
        }
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

    dailyLossLimitContext(
        state: AccountState,
        phase: TradingPhase,
    ): DailyLossLimitContext {
        return {
            isThresholdLocked: state.thresholdLocked,
            peakDayCloseProfit: state.peakDayCloseProfit,
            profit: this.profitFor(state, phase),
        };
    }

    isAccountConcluded(payoutsIssued: number): boolean {
        if (this.maxLifetimePayouts !== null) {
            return payoutsIssued >= this.maxLifetimePayouts;
        }
        const ladder = this.payoutLadder;
        if (ladder === null || ladder.capsAtLastStep === true) return false;
        return payoutsIssued >= ladder.steps.length;
    }

    isBust(state: AccountState, phase: TradingPhase): boolean {
        if (this.drawdownFor(phase).isBreached(state)) return true;

        const limit = resolveDailyLossLimit(
            this.dailyLossLimitFor(phase),
            this.dailyLossLimitContext(state, phase),
        );
        return limit !== null && state.todayPnL <= -limit;
    }

    evalConsistencyRule(): ConsistencyRule | null {
        const rule = this.init.consistency;
        return rule?.appliesToEval() ? rule : null;
    }

    fundedConsistencyRule(payoutsIssued = 0): ConsistencyRule | null {
        const ladder = this.init.fundedConsistencyLadder;
        if (ladder) {
            const share =
                ladder.steps[Math.min(payoutsIssued, ladder.steps.length - 1)];
            return share === undefined
                ? null
                : new ConsistencyRule(ConsistencyScope.Funded, share);
        }
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

    payoutBalanceFloor(
        state: AccountState,
        minRetainedCushion: number,
    ): number {
        const cushionFloor = state.threshold + Math.max(0, minRetainedCushion);
        if (this.payoutBuffer === null) return cushionFloor;
        return Math.max(
            cushionFloor,
            this.payoutBuffer.requiredBalance(
                this.accountSize,
                this.fundedDrawdown.amount,
            ),
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
