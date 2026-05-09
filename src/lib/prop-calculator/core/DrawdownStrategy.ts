import { type AccountState } from './AccountState';

export interface DrawdownLockConfig {
    atProfit: number;
    lockedThreshold: (startingBalance: number) => number;
}

export interface DrawdownStrategyInit {
    amount: number;
    lock?: DrawdownLockConfig;
}

export type DrawdownKind = 'eod-trailing' | 'intraday-trailing' | 'static';

export abstract class DrawdownStrategy {
    abstract readonly kind: DrawdownKind;

    constructor(protected readonly init: DrawdownStrategyInit) {}

    get amount(): number {
        return this.init.amount;
    }

    get lock(): DrawdownLockConfig | undefined {
        return this.init.lock;
    }

    initialThreshold(startingBalance: number): number {
        return startingBalance - this.init.amount;
    }

    abstract onTrade(state: AccountState, tradePnL: number): void;
    abstract onDayClose(state: AccountState): void;

    isBreached(state: AccountState): boolean {
        return state.balance < state.threshold;
    }

    protected ratchet(state: AccountState, target: number): void {
        if (target > state.threshold) state.threshold = target;
    }

    protected maybeLock(state: AccountState): void {
        if (state.thresholdLocked) return;
        const lock = this.init.lock;
        if (!lock) return;
        const profit = state.balance - state.startingBalance;
        if (profit < lock.atProfit) return;
        const lockedTo = lock.lockedThreshold(state.startingBalance);
        if (lockedTo > state.threshold) state.threshold = lockedTo;
        state.thresholdLocked = true;
    }
}

export class IntradayTrailingDrawdown extends DrawdownStrategy {
    readonly kind = 'intraday-trailing' as const;

    onTrade(state: AccountState, _tradePnL: number): void {
        if (!state.thresholdLocked) {
            this.ratchet(state, state.balance - this.init.amount);
            this.maybeLock(state);
        }
    }

    onDayClose(_state: AccountState): void {
        return;
    }
}

export class EodTrailingDrawdown extends DrawdownStrategy {
    readonly kind = 'eod-trailing' as const;

    onTrade(_state: AccountState, _tradePnL: number): void {
        return;
    }

    onDayClose(state: AccountState): void {
        if (!state.thresholdLocked) {
            this.ratchet(state, state.balance - this.init.amount);
            this.maybeLock(state);
        }
    }
}

export class StaticDrawdown extends DrawdownStrategy {
    readonly kind = 'static' as const;

    onTrade(_state: AccountState, _tradePnL: number): void {
        return;
    }
    onDayClose(_state: AccountState): void {
        return;
    }
}
