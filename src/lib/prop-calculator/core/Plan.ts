import {
    type AccountState,
    createInitialState,
    resetForNewDay,
} from './AccountState';
import { ConsistencyRule, ConsistencyScope } from './ConsistencyRule';
import { ContractLimitKind, type ContractLimits } from './ContractLimits';
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
import { type PayoutCapRegime, type PayoutCapStrategy } from './PayoutCap';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import {
    type PayoutLadder,
    type PayoutTier,
    walkPayoutTiers,
} from './PayoutTiers';
import { type PlanId } from './PlanId';
import { TradingPhase } from './TradingPhase';
import {
    type Dollars,
    dollars,
    type Fraction0to1,
    type ProfitShareMultiplier,
} from './units';

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
    isInstantFunded?: boolean;
    label: string;
    maxConsecutiveIdleDays?: number;
    maxEvalTradingDays?: number;
    maxFundedAccounts: number;
    maxLifetimePayouts?: number;
    minDaysAfterPassForPayout?: number;
    minDaysAfterPassForPayoutPerCycle?: number;
    minPayoutProfit?: Dollars;
    minPayoutProfitPerCycle?: Dollars;
    minPayoutRequest?: Dollars;
    minQualifyingDayProfit?: Dollars | null;
    minTradingDays: number;
    payoutBalanceShareCap?: Fraction0to1;
    payoutBuffer?: PayoutBuffer;
    payoutCapOverride?: PayoutCapStrategy;
    payoutFloorEffect?: PayoutFloorEffect;
    payoutLadder?: null | PayoutLadder;
    payoutMethodFee?: Dollars;
    payoutProfitShare?: ProfitShareMultiplier;
    payoutRequestCap?: Dollars;
    payoutTiers: readonly PayoutTier[];
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

    readonly isInstantFunded: boolean;

    readonly label: string;

    readonly maxConsecutiveIdleDays: null | number;

    readonly maxFundedAccounts: number;

    readonly maxEvalTradingDays: null | number;

    readonly maxLifetimePayouts: null | number;

    readonly minDaysAfterPassForPayout: number;

    readonly minDaysAfterPassForPayoutPerCycle: null | number;

    readonly minPayoutProfit: Dollars;

    readonly minPayoutProfitPerCycle: Dollars | null;

    readonly minPayoutRequest: Dollars;

    readonly minQualifyingDayProfit: Dollars | null;

    readonly minTradingDays: number;

    readonly payoutBalanceShareCap: Fraction0to1 | null;

    readonly payoutBuffer: null | PayoutBuffer;

    readonly payoutCapOverride: null | PayoutCapStrategy;

    readonly payoutFloorEffect: PayoutFloorEffect;

    readonly payoutLadder: null | PayoutLadder;

    readonly payoutMethodFee: Dollars;

    readonly payoutProfitShare: null | ProfitShareMultiplier;

    readonly payoutRequestCap: Dollars | null;

    readonly payoutTiers: readonly PayoutTier[];

    readonly profitTarget: Dollars;

    constructor(protected readonly init: PlanInit) {
        this.accountSize = init.accountSize;
        this.consistency = init.consistency;
        this.contractLimits = init.contractLimits ?? null;
        for (const [key, config] of [
            ['fundedMicros', this.contractLimits?.fundedMicros],
            ['fundedMinis', this.contractLimits?.fundedMinis],
        ] as const) {
            if (
                config?.kind === ContractLimitKind.Tiered &&
                config.tiers.length === 0
            ) {
                throw new Error(
                    `${init.label}: contractLimits.${key}.tiers must not be empty`,
                );
            }
        }
        this.drawdown = init.drawdown;
        this.evalDailyLossLimit = init.evalDailyLossLimit;
        this.fees = init.fees;
        this.fundedDailyLossLimit =
            init.fundedDailyLossLimit ?? init.evalDailyLossLimit;
        this.fundedDrawdown = init.fundedDrawdown ?? init.drawdown;
        this.id = init.id;
        this.isInstantFunded = init.isInstantFunded ?? false;
        this.label = init.label;
        this.maxConsecutiveIdleDays = init.maxConsecutiveIdleDays ?? null;
        if (
            this.maxConsecutiveIdleDays !== null &&
            (!Number.isSafeInteger(this.maxConsecutiveIdleDays) ||
                this.maxConsecutiveIdleDays <= 0)
        ) {
            throw new Error(
                `${this.label}: maxConsecutiveIdleDays must be a positive integer or omitted, got ${this.maxConsecutiveIdleDays}`,
            );
        }
        this.maxFundedAccounts = init.maxFundedAccounts;
        this.maxEvalTradingDays = init.maxEvalTradingDays ?? null;
        this.maxLifetimePayouts = init.maxLifetimePayouts ?? null;
        this.minDaysAfterPassForPayout = init.minDaysAfterPassForPayout ?? 0;
        this.minDaysAfterPassForPayoutPerCycle =
            init.minDaysAfterPassForPayoutPerCycle ?? null;
        this.minPayoutProfit = init.minPayoutProfit ?? dollars(0);
        this.minPayoutProfitPerCycle = init.minPayoutProfitPerCycle ?? null;
        this.minPayoutRequest = init.minPayoutRequest ?? dollars(0);
        this.minQualifyingDayProfit = init.minQualifyingDayProfit ?? null;
        this.minTradingDays = init.minTradingDays;
        this.payoutBalanceShareCap = init.payoutBalanceShareCap ?? null;
        this.payoutBuffer = init.payoutBuffer ?? null;
        this.payoutCapOverride = init.payoutCapOverride ?? null;
        if (
            this.payoutCapOverride !== null &&
            (this.payoutBalanceShareCap !== null ||
                init.payoutRequestCap !== undefined)
        ) {
            throw new Error(
                `${this.label}: payoutCapOverride makes payoutBalanceShareCap/payoutRequestCap dead; set only one`,
            );
        }
        if (
            init.fundedConsistencyLadder !== undefined &&
            init.fundedConsistency?.kind === 'set'
        ) {
            throw new Error(
                `${this.label}: fundedConsistencyLadder makes fundedConsistency dead; set only one`,
            );
        }
        if (init.fundedConsistencyLadder?.steps.length === 0) {
            throw new Error(
                `${this.label}: fundedConsistencyLadder.steps must not be empty`,
            );
        }
        this.payoutFloorEffect =
            init.payoutFloorEffect ?? PayoutFloorEffect.None;
        if (
            this.payoutFloorEffect === PayoutFloorEffect.LockAtPlanFloor &&
            this.fundedDrawdown.lock === undefined
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is LockAtPlanFloor but fundedDrawdown has no lock config`,
            );
        }
        this.payoutLadder = init.payoutLadder ?? null;
        if (
            this.payoutLadder !== null &&
            this.payoutLadder.steps.length === 0
        ) {
            throw new Error(
                `${this.label}: payoutLadder.steps must not be empty`,
            );
        }
        this.payoutMethodFee = init.payoutMethodFee ?? dollars(0);
        this.payoutProfitShare = init.payoutProfitShare ?? null;
        this.payoutRequestCap = init.payoutRequestCap ?? null;
        if (
            this.payoutRequestCap !== null &&
            this.minPayoutRequest > this.payoutRequestCap
        ) {
            throw new Error(
                `${this.label}: minPayoutRequest (${this.minPayoutRequest}) exceeds payoutRequestCap (${this.payoutRequestCap})`,
            );
        }
        this.payoutTiers = init.payoutTiers;
        if (this.payoutTiers.length === 0) {
            throw new Error(`${this.label}: payoutTiers must not be empty`);
        }
        const seenThresholds = new Set<number>();
        for (const tier of this.payoutTiers) {
            if (seenThresholds.has(tier.thresholdProfit)) {
                throw new Error(
                    `${this.label}: payoutTiers has more than one tier at thresholdProfit ${tier.thresholdProfit}`,
                );
            }
            seenThresholds.add(tier.thresholdProfit);
        }
        this.profitTarget = init.profitTarget;
    }

    accountProfit(state: AccountState): number {
        return state.balance - state.startingBalance;
    }

    beginFundedPhase(state: AccountState): void {
        state.balance = this.accountSize;
        state.bestDayProfit = 0;
        state.consecutiveIdleDays = 0;
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

    profitFor(state: AccountState): number {
        return this.accountProfit(state);
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

    dailyLossLimitContext(state: AccountState): DailyLossLimitContext {
        return {
            isThresholdLocked: state.thresholdLocked,
            peakDayCloseProfit: state.peakDayCloseProfit,
            profit: this.profitFor(state),
        };
    }

    isAccountConcluded(payoutsIssued: number): boolean {
        if (this.maxLifetimePayouts !== null) {
            return payoutsIssued >= this.maxLifetimePayouts;
        }
        const ladder = this.payoutLadder;
        return ladder === null || ladder.capsAtLastStep === true
            ? false
            : payoutsIssued >= ladder.steps.length;
    }

    isBust(state: AccountState, phase: TradingPhase): boolean {
        return this.drawdownFor(phase).isBreached(state);
    }

    isDayLockedOut(state: AccountState, phase: TradingPhase): boolean {
        const limit = resolveDailyLossLimit(
            this.dailyLossLimitFor(phase),
            this.dailyLossLimitContext(state),
        );
        return limit !== null && state.todayPnL <= -limit;
    }

    clampedIdleDays(state: AccountState): number {
        return this.maxConsecutiveIdleDays === null
            ? 0
            : Math.min(state.consecutiveIdleDays, this.maxConsecutiveIdleDays);
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
        if (
            profit < this.init.profitTarget ||
            state.tradingDays < this.init.minTradingDays
        )
            return false;
        const consistency = this.evalConsistencyRule();
        return !consistency?.isViolated(state.bestDayProfit, profit);
    }

    defaultRetainedCushion(): number {
        return this.fundedDrawdown.amount;
    }

    resolveRetainedCushion(requested: number | undefined): Dollars {
        const floor = this.defaultRetainedCushion();
        return dollars(Math.max(requested ?? floor, floor));
    }

    payoutBalanceFloor(
        state: AccountState,
        minRetainedCushion: number,
    ): number {
        const cushionFloor = state.threshold + Math.max(0, minRetainedCushion);
        return this.payoutBuffer === null
            ? cushionFloor
            : Math.max(
                  cushionFloor,
                  this.payoutBuffer.requiredBalance(
                      this.accountSize,
                      this.fundedDrawdown.amount,
                  ),
              );
    }

    payoutFromProfit(fundedProfit: number): number {
        const gross = walkPayoutTiers(this.init.payoutTiers, fundedProfit);
        return Math.max(0, gross - this.payoutMethodFee);
    }

    resolvedPayoutCap(
        state: AccountState,
        payoutsIssued: number,
    ): PayoutCapRegime {
        return this.payoutCapOverride === null
            ? {
                  balanceShareCap: this.payoutBalanceShareCap,
                  requestCap: this.payoutRequestCap,
              }
            : this.payoutCapOverride.resolve({
                  cumulativeQualifyingDays: state.qualifyingDays,
                  payoutsIssued,
              });
    }

    evalDayCap(requestedDays: number): number {
        return this.maxEvalTradingDays === null
            ? requestedDays
            : Math.min(requestedDays, this.maxEvalTradingDays);
    }

    withOverrides(overrides: Partial<PlanInit>): Plan {
        return new VariantPlan({ ...this.init, ...overrides });
    }

    withMaxLifetimePayouts(maxLifetimePayouts: null | number): Plan {
        return this.withOverrides({
            maxLifetimePayouts: maxLifetimePayouts ?? undefined,
            payoutLadder:
                this.payoutLadder === null
                    ? undefined
                    : { ...this.payoutLadder, capsAtLastStep: true },
        });
    }

    totalCostThroughDay(
        totalDays: number,
        discounts?: CouponDiscounts,
    ): number {
        return totalFees(this.init.fees, totalDays, discounts);
    }
}

class VariantPlan extends Plan {}
