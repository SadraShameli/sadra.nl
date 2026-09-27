import {
    isoDaysBetween,
    PayoutDayGateBasis,
    type Plan,
    requiredDayGateDays,
    sessionDaysForCalendarDays,
} from '../core';

export enum CalendarGateProgressKind {
    MissingAnchor = 'missing-anchor',
    Progress = 'progress',
}

export interface CalendarGateMissingAnchor {
    readonly kind: CalendarGateProgressKind.MissingAnchor;
    readonly restoreProgress: 0;
}

export interface CalendarGateProgress {
    readonly calendarDaysElapsed: number;
    readonly calendarDaysRequired: number;
    readonly isMet: boolean;
    readonly kind: CalendarGateProgressKind.Progress;
    readonly restoreProgress: number;
}

export type CalendarGateProgressResult =
    CalendarGateMissingAnchor | CalendarGateProgress;

export function calendarGateProgress(
    plan: Pick<
        Plan,
        | 'minDaysAfterPassForPayout'
        | 'minDaysAfterPassForPayoutPerCycle'
        | 'payoutDayGateBasis'
    >,
    payoutsIssued: number,
    anchorOn: null | string,
    asOf: string,
): CalendarGateProgressResult {
    if (
        plan.payoutDayGateBasis !==
        PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout
    ) {
        throw new RangeError(
            'calendarGateProgress only applies to plans gated on calendar days since the first trade or payout',
        );
    }
    if (anchorOn === null) {
        return {
            kind: CalendarGateProgressKind.MissingAnchor,
            restoreProgress: 0,
        };
    }
    const calendarDaysRequired = requiredDayGateDays(plan, { payoutsIssued });
    const calendarDaysElapsed = Math.max(0, isoDaysBetween(anchorOn, asOf));
    const sessionDays = sessionDaysForCalendarDays(calendarDaysElapsed);
    return {
        calendarDaysElapsed,
        calendarDaysRequired,
        isMet: calendarDaysElapsed >= calendarDaysRequired,
        kind: CalendarGateProgressKind.Progress,
        restoreProgress: payoutsIssued === 0 ? sessionDays + 1 : sessionDays,
    };
}
