import { type DrawdownState, type DrawdownStrategy } from './DrawdownStrategy';
import { PayoutFloorEffect } from './PayoutFloorEffect';

export function applyPayoutFloorEffect(
    drawdown: DrawdownStrategy | null,
    state: DrawdownState,
    effect: PayoutFloorEffect,
    releaseTarget: number,
): void {
    switch (effect) {
        case PayoutFloorEffect.LockAtPlanFloor: {
            drawdown?.forceLock(state);
            break;
        }
        case PayoutFloorEffect.MoveToLockedFloor: {
            drawdown?.moveToLock(state);
            break;
        }
        case PayoutFloorEffect.None: {
            break;
        }
        case PayoutFloorEffect.ReleaseFloor: {
            drawdown?.release(state, releaseTarget);
            break;
        }
    }
}

export function postPayoutThreshold(
    drawdown: DrawdownStrategy | null,
    state: DrawdownState,
    effect: PayoutFloorEffect,
    releaseTarget: number,
): number {
    switch (effect) {
        case PayoutFloorEffect.LockAtPlanFloor:
        case PayoutFloorEffect.MoveToLockedFloor: {
            return (
                drawdown?.prospectiveLockThreshold(state, effect) ??
                state.threshold
            );
        }
        case PayoutFloorEffect.None: {
            return state.threshold;
        }
        case PayoutFloorEffect.ReleaseFloor: {
            return releaseTarget;
        }
    }
}
