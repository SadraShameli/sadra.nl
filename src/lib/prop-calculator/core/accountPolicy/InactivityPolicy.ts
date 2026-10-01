import { CALENDAR_DAYS_PER_WEEK } from '~/lib/prop-calculator/core/constants';
import { type Dollars } from '~/lib/prop-calculator/core/lib/units';
import { type Plan } from '~/lib/prop-calculator/core/Plan';
import { type TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';

import { type FirmPolicySource } from './FirmPolicySource';

export enum InactivityBasisKind {
    CalendarDays = 'calendar-days',
    CalendarWeek = 'calendar-week',
    TradingDays = 'trading-days',
}

export enum InactivityMinimumQualifyingKind {
    AnyTrade = 'any-trade',
    Dollars = 'dollars',
}

export enum InactivityOutcome {
    Closure = 'closure',
    DiscretionaryClosure = 'discretionary-closure',
}

export interface InactivityCountMismatch {
    readonly modeledCount: null | number;
    readonly verifiedCount: number;
}

export type InactivityMinimumQualifying =
    | {
          readonly amount: Dollars;
          readonly kind: InactivityMinimumQualifyingKind.Dollars;
      }
    | { readonly kind: InactivityMinimumQualifyingKind.AnyTrade };

export type InactivityPolicy =
    | (InactivityPolicyBase & {
          readonly kind: InactivityBasisKind.CalendarDays;
          readonly maxIdleDays: null | number;
      })
    | (InactivityPolicyBase & {
          readonly kind: InactivityBasisKind.CalendarWeek;
          readonly sessionsPerWeek: number;
      })
    | (InactivityPolicyBase & {
          readonly kind: InactivityBasisKind.TradingDays;
          readonly maxIdleDays: null | number;
      });

interface InactivityPolicyBase {
    readonly minimumQualifying: InactivityMinimumQualifying;
    readonly mismatch: InactivityCountMismatch | null;
    readonly outcome: InactivityOutcome;
    readonly source: FirmPolicySource | undefined;
}

export function assertValidInactivityPolicy(
    policy: InactivityPolicy,
    label: string,
): void {
    if (policy.kind !== InactivityBasisKind.CalendarWeek) return;
    if (
        !Number.isSafeInteger(policy.sessionsPerWeek) ||
        policy.sessionsPerWeek <= 0 ||
        policy.sessionsPerWeek > CALENDAR_DAYS_PER_WEEK
    ) {
        throw new Error(
            `${label}: calendar-week sessionsPerWeek must be between 1 and ${CALENDAR_DAYS_PER_WEEK}, got ${policy.sessionsPerWeek}`,
        );
    }
}

export function inactivityCountMismatch(
    modeledCount: null | number,
    verifiedCount: null | number,
): InactivityCountMismatch | null {
    return verifiedCount === null || modeledCount === verifiedCount ? null : { modeledCount, verifiedCount };
}

export function unverifiedInactivityPolicyFor(
    plan: Plan,
    phase: TradingPhase,
): InactivityPolicy {
    const calendarWeekRule = plan.calendarWeekInactivityFor(phase);
    if (calendarWeekRule !== null) {
        return {
            kind: InactivityBasisKind.CalendarWeek,
            minimumQualifying: {
                kind: InactivityMinimumQualifyingKind.AnyTrade,
            },
            mismatch: null,
            outcome: InactivityOutcome.Closure,
            sessionsPerWeek: calendarWeekRule.sessionsPerWeek,
            source: undefined,
        };
    }
    return {
        kind: InactivityBasisKind.TradingDays,
        maxIdleDays: plan.maxConsecutiveIdleDaysFor(phase),
        minimumQualifying: { kind: InactivityMinimumQualifyingKind.AnyTrade },
        mismatch: null,
        outcome: InactivityOutcome.Closure,
        source: undefined,
    };
}
