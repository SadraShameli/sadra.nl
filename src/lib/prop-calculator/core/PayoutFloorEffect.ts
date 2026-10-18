export enum PayoutFloorEffect {
    LockAtPlanFloor = 'lock-at-plan-floor',
    MoveToLockedFloor = 'move-to-locked-floor',
    None = 'none',
    ReleaseFloor = 'release-floor',
}

export type PayoutLockEffect =
    PayoutFloorEffect.LockAtPlanFloor | PayoutFloorEffect.MoveToLockedFloor;

export function isPayoutLockEffect(
    effect: PayoutFloorEffect,
): effect is PayoutLockEffect {
    switch (effect) {
        case PayoutFloorEffect.LockAtPlanFloor:
        case PayoutFloorEffect.MoveToLockedFloor: {
            return true;
        }
        case PayoutFloorEffect.None:
        case PayoutFloorEffect.ReleaseFloor: {
            return false;
        }
    }
}

export function payoutFloorEffectName(effect: PayoutFloorEffect): string {
    switch (effect) {
        case PayoutFloorEffect.LockAtPlanFloor: {
            return 'LockAtPlanFloor';
        }
        case PayoutFloorEffect.MoveToLockedFloor: {
            return 'MoveToLockedFloor';
        }
        case PayoutFloorEffect.None: {
            return 'None';
        }
        case PayoutFloorEffect.ReleaseFloor: {
            return 'ReleaseFloor';
        }
    }
}
