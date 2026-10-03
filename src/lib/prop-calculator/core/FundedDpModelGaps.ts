import {
    type FundedDpModelGap,
    FundedDpModelGapKind,
} from './FundedDpModelGapKind';
import {
    defaultPayoutRegimeCap,
    fundedCalendarWeekInactivityDpGap,
} from './FundedStateValue';
import { PayoutCountTieredPayoutCap } from './PayoutCap';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type Plan } from './Plan';

export const FUNDED_GRID_SATURATION_WARNING_SHARE = 0.01;

export function fundedDpModelGaps(plan: Plan): FundedDpModelGap[] {
    const gaps: FundedDpModelGap[] = [];
    const calendarWeekGap = fundedCalendarWeekInactivityDpGap(plan);
    if (calendarWeekGap !== null) {
        gaps.push({
            kind: FundedDpModelGapKind.CalendarWeekInactivityIgnored,
            message: withoutLeadingPlanLabel(plan, calendarWeekGap),
        });
    }
    if (plan.maxLifetimePayoutDollars !== null) {
        gaps.push({
            kind: FundedDpModelGapKind.LifetimeDollarCapIgnored,
            maxLifetimePayoutDollars: plan.maxLifetimePayoutDollars,
        });
    }
    if (plan.payoutCapOverride instanceof PayoutCountTieredPayoutCap) {
        const payoutRegimeCap = defaultPayoutRegimeCap(plan);
        for (const tier of plan.payoutCapOverride.tiers) {
            if (tier.fromPayoutIndex > payoutRegimeCap) {
                gaps.push({
                    fromPayoutIndex: tier.fromPayoutIndex,
                    kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
                    payoutRegimeCap,
                });
            }
        }
    }
    if (plan.fundedDrawdown.lock?.atProfit === null) {
        gaps.push({
            kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
        });
    }
    if (plan.payoutFloorEffect === PayoutFloorEffect.ReleaseFloor) {
        gaps.push({
            kind: FundedDpModelGapKind.PayoutFloorReleaseUnvalidated,
        });
    }
    return gaps;
}

export function fundedGridSaturationGap(
    shareAtOrAboveTop: number,
    warningShare: number = FUNDED_GRID_SATURATION_WARNING_SHARE,
): FundedDpModelGap | null {
    return shareAtOrAboveTop >= warningShare
        ? {
              kind: FundedDpModelGapKind.FundedGridSaturationHigh,
              shareAtOrAboveTop,
          }
        : null;
}

function withoutLeadingPlanLabel(plan: Plan, message: string): string {
    const planLabelPrefix = `${plan.label} `;
    return message.startsWith(planLabelPrefix)
        ? message.slice(planLabelPrefix.length)
        : message;
}

export {
    type FundedDpModelGap,
    FundedDpModelGapKind,
} from './FundedDpModelGapKind';
