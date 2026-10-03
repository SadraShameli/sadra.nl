import { type AccountState } from './AccountState';
import {
    type Dollars,
    isAtOrBelowWithinCentTolerance,
    ONE_CENT,
} from './lib/units';
import { PayoutFloorEffect, type PayoutLockEffect } from './PayoutFloorEffect';

export enum DrawdownKind {
    EodTrailing = 'eod-trailing',
    IntradayTrailing = 'intraday-trailing',
    Static = 'static',
}

export interface DrawdownLockConfig {
    atProfit: Dollars | null;
    lockedThreshold: (startingBalance: number) => number;
}

export type DrawdownState = Pick<
    AccountState,
    'balance' | 'startingBalance' | 'threshold' | 'thresholdLocked'
>;

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

    isBreached(state: DrawdownState): boolean {
        return state.balance <= state.threshold;
    }

    abstract allowsWithdrawalWhileUnlocked(retainedCushion: number): boolean;

    abstract intradayLockDistance(state: DrawdownState): number;

    abstract onDayClose(state: DrawdownState): void;

    abstract onTrade(
        state: DrawdownState,
        tradePnL: number,
        peakPnL?: number,
    ): void;

    forceLock(state: DrawdownState): void {
        if (state.thresholdLocked) return;
        const lock = this.init.lock;
        if (!lock) return;
        const lockedTo = lock.lockedThreshold(state.startingBalance);
        if (lockedTo > state.threshold) state.threshold = lockedTo;
        state.thresholdLocked = true;
    }

    moveToLock(state: DrawdownState): void {
        if (state.thresholdLocked) return;
        const lock = this.init.lock;
        if (!lock) return;
        state.threshold = lock.lockedThreshold(state.startingBalance);
        state.thresholdLocked = true;
    }

    prospectiveLockThreshold(
        state: DrawdownState,
        effect: PayoutLockEffect,
    ): number {
        const lock = this.init.lock;
        if (!lock || state.thresholdLocked) return state.threshold;
        const lockedTo = lock.lockedThreshold(state.startingBalance);
        switch (effect) {
            case PayoutFloorEffect.LockAtPlanFloor: {
                return Math.max(state.threshold, lockedTo);
            }
            case PayoutFloorEffect.MoveToLockedFloor: {
                return lockedTo;
            }
        }
    }

    release(state: DrawdownState, floorTo: number): void {
        state.threshold = floorTo;
        state.thresholdLocked = true;
    }

    protected maybeLock(
        state: DrawdownState,
        profit: number = state.balance - state.startingBalance,
    ): void {
        const lock = this.init.lock;
        const trigger = lock?.atProfit ?? null;
        if (!lock || trigger === null || profit < trigger) return;
        state.threshold = lock.lockedThreshold(state.startingBalance);
        state.thresholdLocked = true;
    }

    protected ratchet(state: DrawdownState, target: number): void {
        if (target > state.threshold) state.threshold = target;
    }
}

export class EodTrailingDrawdown extends DrawdownStrategy {
    readonly kind = DrawdownKind.EodTrailing;

    allowsWithdrawalWhileUnlocked(retainedCushion: number): boolean {
        return retainedCushion < this.amount;
    }

    intradayLockDistance(_state: DrawdownState): number {
        return Infinity;
    }

    onDayClose(state: DrawdownState): void {
        if (state.thresholdLocked) {
            return;
        }

        this.ratchet(state, state.balance - this.init.amount);
        this.maybeLock(state);
    }

    onTrade(_state: DrawdownState, _tradePnL: number, _peakPnL?: number): void {
        return;
    }
}

export class IntradayTrailingDrawdown extends DrawdownStrategy {
    readonly kind = DrawdownKind.IntradayTrailing;

    allowsWithdrawalWhileUnlocked(retainedCushion: number): boolean {
        return retainedCushion < this.amount;
    }

    intradayLockDistance(state: DrawdownState): number {
        const trigger = this.lock?.atProfit ?? null;
        return trigger === null || state.thresholdLocked
            ? Infinity
            : state.startingBalance + trigger - state.balance;
    }

    onDayClose(_state: DrawdownState): void {
        return;
    }

    onTrade(
        state: DrawdownState,
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

    allowsWithdrawalWhileUnlocked(_retainedCushion: number): boolean {
        return true;
    }

    intradayLockDistance(_state: DrawdownState): number {
        return Infinity;
    }

    onDayClose(_state: DrawdownState): void {
        return;
    }
    onTrade(_state: DrawdownState, _tradePnL: number, _peakPnL?: number): void {
        return;
    }
}

export class StrictlyBelowStaticDrawdown extends StaticDrawdown {
    override isBreached(state: DrawdownState): boolean {
        return isAtOrBelowWithinCentTolerance(
            state.balance,
            state.threshold - ONE_CENT,
        );
    }
}
