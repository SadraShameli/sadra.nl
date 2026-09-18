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
    payoutTiers: readonly PayoutTier[];
    startingBalance?: Dollars;
}

export class LivePlan {
    readonly contractLimit: ContractLimitConfig | null;

    readonly cushionPercent: LiveCushionPercent;

    readonly label: string;

    readonly liveDailyLossLimit: DailyLossLimitConfig | null;

    readonly liveDrawdown: DrawdownStrategy | null;

    readonly payoutTiers: readonly PayoutTier[];

    readonly startingBalance: Dollars;

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
        this.startingBalance = init.startingBalance ?? dollars(0);
        if (this.liveDrawdown === null && this.liveDailyLossLimit === null) {
            throw new Error(
                `${this.label}: must set liveDrawdown or liveDailyLossLimit`,
            );
        }
        if (this.liveDrawdown !== null && this.liveDailyLossLimit !== null) {
            throw new Error(
                `${this.label}: set only one of liveDrawdown or liveDailyLossLimit`,
            );
        }
        this.payoutTiers = init.payoutTiers;
        if (this.payoutTiers.length === 0) {
            throw new Error(`${this.label}: payoutTiers must not be empty`);
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
        return state.thresholdLocked
            ? Math.max(0, state.balance - state.threshold)
            : 0;
    }
}
