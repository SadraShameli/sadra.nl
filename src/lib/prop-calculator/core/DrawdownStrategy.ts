import { type AccountState } from './AccountState';
import { type Dollars } from './units';

export enum DrawdownKind {
    EodTrailing = 'eod-trailing',
    IntradayTrailing = 'intraday-trailing',
    Static = 'static',
}

export interface DrawdownLockConfig {
    atProfit: Dollars;
    lockedThreshold: (startingBalance: number) => number;
}

export interface DrawdownStrategyInit {
    amount: Dollars;
    lock?: DrawdownLockConfig;
}

export abstract class DrawdownStrategy {
    readonly amount: Dollars;

    abstract readonly kind: DrawdownKind;

    readonly lock: DrawdownLockConfig | undefined;

    constructor(protected readonly init: DrawdownStrategyInit) {
        this.amount = init.amount;
        this.lock = init.lock;
    }

    initialThreshold(startingBalance: number): number {
        return startingBalance - this.init.amount;
    }

    isBreached(state: AccountState): boolean {
        return state.balance <= state.threshold;
    }
    abstract onDayClose(state: AccountState): void;

    abstract onTrade(
        state: AccountState,
        tradePnL: number,
        peakPnL?: number,
    ): void;

    forceLock(state: AccountState): void {
        if (state.thresholdLocked) return;
        const lock = this.init.lock;
        if (!lock) return;
        const lockedTo = lock.lockedThreshold(state.startingBalance);
        if (lockedTo > state.threshold) state.threshold = lockedTo;
        state.thresholdLocked = true;
    }

    release(state: AccountState, floorTo: number): void {
        state.threshold = floorTo;
        state.thresholdLocked = true;
    }

    protected maybeLock(
        state: AccountState,
        profit: number = state.balance - state.startingBalance,
    ): void {
        const lock = this.init.lock;
        if (!lock || profit < lock.atProfit) return;
        state.threshold = lock.lockedThreshold(state.startingBalance);
        state.thresholdLocked = true;
    }

    protected ratchet(state: AccountState, target: number): void {
        if (target > state.threshold) state.threshold = target;
    }
}

export class EodTrailingDrawdown extends DrawdownStrategy {
    readonly kind = DrawdownKind.EodTrailing;

    onDayClose(state: AccountState): void {
        if (state.thresholdLocked) {
            return;
        }

        this.ratchet(state, state.balance - this.init.amount);
        this.maybeLock(state);
    }

    onTrade(_state: AccountState, _tradePnL: number, _peakPnL?: number): void {
        return;
    }
}

export class IntradayTrailingDrawdown extends DrawdownStrategy {
    readonly kind = DrawdownKind.IntradayTrailing;

    onDayClose(_state: AccountState): void {
        return;
    }

    onTrade(
        state: AccountState,
        tradePnL: number,
        peakPnL: number = tradePnL,
    ): void {
        if (state.thresholdLocked) {
            return;
        }

        const peakBalance = state.balance - tradePnL + peakPnL;
        this.ratchet(state, peakBalance - this.init.amount);
        this.maybeLock(state, peakBalance - state.startingBalance);
    }
}

export class StaticDrawdown extends DrawdownStrategy {
    readonly kind = DrawdownKind.Static;

    onDayClose(_state: AccountState): void {
        return;
    }
    onTrade(_state: AccountState, _tradePnL: number, _peakPnL?: number): void {
        return;
    }
}
