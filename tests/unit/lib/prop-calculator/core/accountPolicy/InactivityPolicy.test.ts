import { describe, expect, it } from 'vitest';

import {
    assertValidInactivityPolicy,
    CALENDAR_DAYS_PER_WEEK,
    dollars,
    InactivityBasisKind,
    inactivityCountMismatch,
    InactivityMinimumQualifyingKind,
    InactivityOutcome,
    type Plan,
    TradingPhase,
    unverifiedInactivityPolicyFor,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

const REGISTRY_FIRST_PLAN = ALL_FIRMS.flatMap((firm) => firm.plans)[0];
if (REGISTRY_FIRST_PLAN === undefined) throw new Error('registry has no plans');
const BASE_PLAN: Plan = REGISTRY_FIRST_PLAN;

describe('unverifiedInactivityPolicyFor', () => {
    it("reads the plan's own trading-day idle count for a plan with no calendar-week rule", () => {
        const plan = BASE_PLAN.withOverrides({
            calendarWeekInactivity: undefined,
            maxConsecutiveIdleDays: 21,
        });
        const policy = unverifiedInactivityPolicyFor(plan, TradingPhase.Funded);
        expect(policy.kind).toBe(InactivityBasisKind.TradingDays);
        if (policy.kind !== InactivityBasisKind.TradingDays) {
            throw new Error('expected TradingDays');
        }
        expect(policy.maxIdleDays).toBe(21);
        expect(policy.source).toBeUndefined();
        expect(policy.mismatch).toBeNull();
        expect(policy.outcome).toBe(InactivityOutcome.Closure);
        expect(policy.minimumQualifying.kind).toBe(
            InactivityMinimumQualifyingKind.AnyTrade,
        );
    });

    it('carries a null maxIdleDays when the engine models no idle-day closure for the phase', () => {
        const plan = BASE_PLAN.withOverrides({
            calendarWeekInactivity: undefined,
            evalMaxConsecutiveIdleDays: null,
        });
        const policy = unverifiedInactivityPolicyFor(plan, TradingPhase.Eval);
        expect(policy.kind).toBe(InactivityBasisKind.TradingDays);
        if (policy.kind !== InactivityBasisKind.TradingDays) {
            throw new Error('expected TradingDays');
        }
        expect(policy.maxIdleDays).toBeNull();
    });

    it('uses the CalendarWeek basis for a plan whose funded phase already carries a calendar-week rule (TPT PRO)', () => {
        const tptPro = new TakeProfitTrader().plans[0];
        if (tptPro === undefined) throw new Error('TPT has no plans');
        const policy = unverifiedInactivityPolicyFor(
            tptPro,
            TradingPhase.Funded,
        );
        expect(policy.kind).toBe(InactivityBasisKind.CalendarWeek);
        if (policy.kind !== InactivityBasisKind.CalendarWeek) {
            throw new Error('expected CalendarWeek');
        }
        expect(policy.sessionsPerWeek).toBe(
            tptPro.calendarWeekInactivityFor(TradingPhase.Funded)
                ?.sessionsPerWeek,
        );
        expect(policy.source).toBeUndefined();
    });
});

describe('inactivityCountMismatch', () => {
    it('is null when there is no verified count to compare against', () => {
        expect(inactivityCountMismatch(21, null)).toBeNull();
    });

    it('is null when the verified count agrees with the modeled count', () => {
        expect(inactivityCountMismatch(7, 7)).toBeNull();
    });

    it('flags a differing verified count', () => {
        expect(inactivityCountMismatch(null, 7)).toStrictEqual({
            modeledCount: null,
            verifiedCount: 7,
        });
        expect(inactivityCountMismatch(21, 7)).toStrictEqual({
            modeledCount: 21,
            verifiedCount: 7,
        });
    });
});

describe('assertValidInactivityPolicy', () => {
    it('accepts a calendar-week policy within the week', () => {
        expect(() =>
            assertValidInactivityPolicy(
                {
                    kind: InactivityBasisKind.CalendarWeek,
                    minimumQualifying: {
                        kind: InactivityMinimumQualifyingKind.AnyTrade,
                    },
                    mismatch: null,
                    outcome: InactivityOutcome.Closure,
                    sessionsPerWeek: CALENDAR_DAYS_PER_WEEK,
                    source: undefined,
                },
                'test',
            ),
        ).not.toThrow();
    });

    it('rejects a calendar-week sessionsPerWeek above the week length', () => {
        expect(() =>
            assertValidInactivityPolicy(
                {
                    kind: InactivityBasisKind.CalendarWeek,
                    minimumQualifying: {
                        kind: InactivityMinimumQualifyingKind.AnyTrade,
                    },
                    mismatch: null,
                    outcome: InactivityOutcome.Closure,
                    sessionsPerWeek: CALENDAR_DAYS_PER_WEEK + 1,
                    source: undefined,
                },
                'test',
            ),
        ).toThrow();
    });

    it('never rejects a non-calendar-week policy', () => {
        expect(() =>
            assertValidInactivityPolicy(
                {
                    kind: InactivityBasisKind.TradingDays,
                    maxIdleDays: null,
                    minimumQualifying: {
                        amount: dollars(1),
                        kind: InactivityMinimumQualifyingKind.Dollars,
                    },
                    mismatch: null,
                    outcome: InactivityOutcome.DiscretionaryClosure,
                    source: undefined,
                },
                'test',
            ),
        ).not.toThrow();
    });
});
