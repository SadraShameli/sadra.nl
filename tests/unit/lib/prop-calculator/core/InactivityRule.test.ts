import { describe, expect, it } from 'vitest';

import {
    assertValidCalendarWeekInactivityRule,
    type CalendarWeekInactivityRule,
    didCalendarWeekCloseForInactivity,
    type TradingDayCloseResult,
} from '~/lib/prop-calculator/core';
import { advanceCalendarWeekForInactivity } from '~/lib/prop-calculator/core/InactivityRule';

describe('didCalendarWeekCloseForInactivity is re-exported through the shared core barrel (N-80 follow-up)', () => {
    it('is exported by the barrel, not only the internal file', () => {
        expect(typeof didCalendarWeekCloseForInactivity).toBe('function');
    });

    it('returns false while the rule is null and touches nothing', () => {
        const state = {};
        expect(didCalendarWeekCloseForInactivity(null, state, false)).toBe(
            false,
        );
        expect(state).toStrictEqual({});
    });

    it('closes only an entirely idle calendar week, resetting on every completed week', () => {
        const rule: CalendarWeekInactivityRule = { sessionsPerWeek: 5 };
        const state: {
            calendarWeekSessionsElapsed?: number;
            calendarWeekSessionsTraded?: number;
        } = {};

        expect(didCalendarWeekCloseForInactivity(rule, state, true)).toBe(
            false,
        );
        expect(state.calendarWeekSessionsElapsed).toBe(1);
        expect(state.calendarWeekSessionsTraded).toBe(1);

        for (let session = 0; session < 3; session++) {
            expect(didCalendarWeekCloseForInactivity(rule, state, false)).toBe(
                false,
            );
        }
        expect(didCalendarWeekCloseForInactivity(rule, state, false)).toBe(
            false,
        );
        expect(state.calendarWeekSessionsElapsed).toBe(0);
        expect(state.calendarWeekSessionsTraded).toBe(0);
    });

    it('closes a five-session week with zero traded sessions', () => {
        const rule: CalendarWeekInactivityRule = { sessionsPerWeek: 5 };
        const state: {
            calendarWeekSessionsElapsed?: number;
            calendarWeekSessionsTraded?: number;
        } = {};

        for (let session = 0; session < 4; session++) {
            expect(didCalendarWeekCloseForInactivity(rule, state, false)).toBe(
                false,
            );
        }
        expect(didCalendarWeekCloseForInactivity(rule, state, false)).toBe(
            true,
        );
    });
});

describe('advanceCalendarWeekForInactivity is the pure week-advancing step kept separate from the close query', () => {
    it('only advances the session and traded counters, never resets or reports closure', () => {
        const state: {
            calendarWeekSessionsElapsed?: number;
            calendarWeekSessionsTraded?: number;
        } = {};
        advanceCalendarWeekForInactivity(state, false);
        advanceCalendarWeekForInactivity(state, false);
        advanceCalendarWeekForInactivity(state, true);
        expect(state.calendarWeekSessionsElapsed).toBe(3);
        expect(state.calendarWeekSessionsTraded).toBe(1);
    });
});

describe('assertValidCalendarWeekInactivityRule is re-exported through the core barrel', () => {
    it('throws on a non-positive sessionsPerWeek', () => {
        expect(() =>
            assertValidCalendarWeekInactivityRule(
                { sessionsPerWeek: 0 },
                'toy plan',
            ),
        ).toThrow(/calendarWeekInactivity\.sessionsPerWeek/);
    });

    it('accepts a positive integer sessionsPerWeek', () => {
        expect(() =>
            assertValidCalendarWeekInactivityRule(
                { sessionsPerWeek: 5 },
                'toy plan',
            ),
        ).not.toThrow();
    });
});

describe('TradingDayCloseResult is re-exported through the core barrel', () => {
    it('shapes a closedForCalendarWeekInactivity boolean', () => {
        const result: TradingDayCloseResult = {
            closedForCalendarWeekInactivity: true,
        };
        expect(result.closedForCalendarWeekInactivity).toBe(true);
    });
});
