import { type ContractLimitConfig, ContractLimitKind } from './ContractLimits';
import {
    type DailyLossLimitConfig,
    resolveDailyLossLimit,
} from './DailyLossLimit';
import { type DrawdownStrategy } from './DrawdownStrategy';
import { dollars, type Dollars, type Fraction0to1 } from './lib/units';
import {
    createInitialLiveAccountState,
    type LiveAccountState,
} from './LiveAccountState';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type PayoutTier, walkPayoutTiers } from './PayoutTiers';

export interface LiveCushionPercent {
    postLock: Fraction0to1;
    preLock: Fraction0to1;
}

export interface LivePlanInit {
    contractLimit?: ContractLimitConfig;
    cushionPercent: LiveCushionPercent;
    label: string;
    liveDailyLossLimit: DailyLossLimitConfig | null;
    liveDrawdown: DrawdownStrategy | null;
    maxConsecutiveIdleDays?: number;
    payoutFloor?: Dollars;
    payoutFloorEffect?: PayoutFloorEffect;
    payoutTiers: readonly PayoutTier[];
    requiresLockForWithdrawal?: boolean;
    startingBalance?: Dollars;
    transitionPayout?: Dollars;
}

export class LivePlan {
    readonly contractLimit: ContractLimitConfig | null;

    readonly cushionPercent: LiveCushionPercent;

    readonly label: string;

    readonly liveDailyLossLimit: DailyLossLimitConfig | null;

    readonly liveDrawdown: DrawdownStrategy | null;

    readonly maxConsecutiveIdleDays: null | number;

    readonly payoutFloor: Dollars | null;

    readonly payoutFloorEffect: PayoutFloorEffect;

    readonly payoutTiers: readonly PayoutTier[];

    readonly requiresLockForWithdrawal: boolean;

    readonly startingBalance: Dollars;

    readonly transitionPayout: Dollars;

    constructor(init: LivePlanInit) {
        this.contractLimit = init.contractLimit ?? null;
        if (
            this.contractLimit?.kind === ContractLimitKind.Tiered &&
            this.contractLimit.tiers.length === 0
        ) {
            throw new Error(
                `${init.label}: contractLimit.tiers must not be empty`,
            );
        }
        this.cushionPercent = init.cushionPercent;
        this.label = init.label;
        this.liveDailyLossLimit = init.liveDailyLossLimit;
        this.liveDrawdown = init.liveDrawdown;
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
        this.payoutFloor = init.payoutFloor ?? null;
        this.payoutFloorEffect =
            init.payoutFloorEffect ?? PayoutFloorEffect.None;
        this.requiresLockForWithdrawal = init.requiresLockForWithdrawal ?? true;
        this.startingBalance = init.startingBalance ?? dollars(0);
        this.transitionPayout = init.transitionPayout ?? dollars(0);
        if (this.liveDrawdown === null && this.liveDailyLossLimit === null) {
            throw new Error(
                `${this.label}: must set liveDrawdown or liveDailyLossLimit`,
            );
        }
        if (
            this.payoutFloorEffect === PayoutFloorEffect.LockAtPlanFloor &&
            this.liveDrawdown?.lock === undefined
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is LockAtPlanFloor but liveDrawdown has no lock config`,
            );
        }
        if (
            this.payoutFloorEffect === PayoutFloorEffect.LockAtPlanFloor &&
            this.requiresLockForWithdrawal
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is LockAtPlanFloor but requiresLockForWithdrawal gates every withdrawal behind the lock, so the effect could never fire`,
            );
        }
        if (
            this.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor &&
            this.liveDrawdown === null
        ) {
            throw new Error(
                `${this.label}: payoutFloorEffect is ReleaseFloor but liveDrawdown is null`,
            );
        }
        if (
            this.payoutFloor !== null &&
            this.payoutFloorEffect !== PayoutFloorEffect.None
        ) {
            throw new Error(
                `${this.label}: payoutFloor and a non-None payoutFloorEffect cannot both be set -- withdraw() would move the threshold to the effect's floor while withdrawableAmount() had already capped the withdrawal at the payoutFloor override, letting balance fall below the effect's floor`,
            );
        }
        this.payoutTiers = init.payoutTiers;
        if (this.payoutTiers.length === 0) {
            throw new Error(`${this.label}: payoutTiers must not be empty`);
        }
    }

    private floorAfterWithdrawal(state: LiveAccountState): number {
        switch (this.payoutFloorEffect) {
            case PayoutFloorEffect.LockAtPlanFloor: {
                const lock = this.liveDrawdown?.lock;
                return lock === undefined || state.thresholdLocked
                    ? state.threshold
                    : Math.max(
                          state.threshold,
                          lock.lockedThreshold(state.startingBalance),
                      );
            }
            case PayoutFloorEffect.None: {
                return state.threshold;
            }
            case PayoutFloorEffect.ReleaseFloor: {
                return this.startingBalance;
            }
        }
    }

    cushionPercentFor(state: LiveAccountState): Fraction0to1 {
        return state.thresholdLocked
            ? this.cushionPercent.postLock
            : this.cushionPercent.preLock;
    }

    initialState(): LiveAccountState {
        const initialThreshold =
            this.liveDrawdown === null
                ? 0
                : this.liveDrawdown.initialThreshold(this.startingBalance);
        return createInitialLiveAccountState(
            this.startingBalance,
            initialThreshold,
        );
    }

    isBust(state: LiveAccountState): boolean {
        return this.liveDrawdown?.isBreached(state) ?? false;
    }

    isDayLockedOut(state: LiveAccountState): boolean {
        if (this.liveDailyLossLimit === null) return false;
        const limit = resolveDailyLossLimit(this.liveDailyLossLimit, {
            isThresholdLocked: state.thresholdLocked,
            peakDayCloseProfit: state.peakDayCloseProfit,
            profit: state.balance - state.startingBalance,
        });
        return limit !== null && state.todayPnL <= -limit;
    }

    payoutFromProfit(liveProfit: number): number {
        return walkPayoutTiers(this.payoutTiers, liveProfit);
    }

    withdrawableAmount(state: LiveAccountState): number {
        if (this.liveDrawdown === null) {
            return Math.max(0, state.balance - state.startingBalance);
        }
        if (!this.requiresLockForWithdrawal || state.thresholdLocked) {
            const floor = this.payoutFloor ?? this.floorAfterWithdrawal(state);
            return Math.max(0, state.balance - floor);
        }
        return 0;
    }

    withdraw(state: LiveAccountState, amount: number): void {
        state.balance -= amount;
        switch (this.payoutFloorEffect) {
            case PayoutFloorEffect.LockAtPlanFloor: {
                this.liveDrawdown?.forceLock(state);
                break;
            }
            case PayoutFloorEffect.None: {
                break;
            }
            case PayoutFloorEffect.ReleaseFloor: {
                this.liveDrawdown?.release(state, this.startingBalance);
                break;
            }
        }
    }
}
