import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    TradingSessionCalendar,
} from '~/lib/prop-accounts/alerts';
import { ReviewWeekday } from '~/lib/prop-calculator/advisor';

import {
    FRIDAY,
    MONDAY,
    SATURDAY,
    SUNDAY,
    TUESDAY,
    WEDNESDAY,
} from './alertFixtures';

describe('TradingSessionCalendar.lastSessionBefore', () => {
    it.each([
        [WEDNESDAY, TUESDAY],
        [TUESDAY, MONDAY],
        [MONDAY, FRIDAY],
        [SUNDAY, FRIDAY],
        [SATURDAY, FRIDAY],
        ['2026-01-01', '2025-12-31'],
        ['2026-03-02', '2026-02-27'],
    ])('the last session before %s is %s', (today, expected) => {
        expect(TradingSessionCalendar.lastSessionBefore(today).date).toBe(
            expected,
        );
    });

    it('discloses that no holiday calendar is modeled', () => {
        expect(
            TradingSessionCalendar.lastSessionBefore(WEDNESDAY).disclosure,
        ).toBe(AlertDisclosure.NoHolidayCalendar);
    });

    it('rejects a malformed date', () => {
        expect(() =>
            TradingSessionCalendar.lastSessionBefore('2026-9-23'),
        ).toThrow(RangeError);
        expect(() =>
            TradingSessionCalendar.lastSessionBefore('2026-02-30'),
        ).toThrow(RangeError);
    });
});

describe('TradingSessionCalendar day arithmetic', () => {
    it('counts calendar days between two dates, signed', () => {
        expect(TradingSessionCalendar.daysBetween(FRIDAY, WEDNESDAY)).toBe(5);
        expect(TradingSessionCalendar.daysBetween(WEDNESDAY, FRIDAY)).toBe(-5);
        expect(
            TradingSessionCalendar.daysBetween('2026-03-01', '2026-04-01'),
        ).toBe(31);
        expect(
            TradingSessionCalendar.daysBetween('2026-10-24', '2026-10-26'),
        ).toBe(2);
    });

    it('adds days across month and year ends', () => {
        expect(TradingSessionCalendar.addDays('2026-12-30', 3)).toBe(
            '2027-01-02',
        );
        expect(TradingSessionCalendar.addDays(WEDNESDAY, -5)).toBe(FRIDAY);
    });

    it.each([
        [MONDAY, MONDAY, 0],
        [MONDAY, TUESDAY, 1],
        [FRIDAY, MONDAY, 1],
        [SATURDAY, MONDAY, 0],
        [SUNDAY, WEDNESDAY, 2],
        ['2026-09-14', MONDAY, 5],
        ['2026-09-01', WEDNESDAY, 16],
        ['2026-09-01', '2026-09-30', 21],
        ['2026-12-28', '2027-01-11', 10],
        [WEDNESDAY, FRIDAY, 0],
    ])(
        'counts the weekday sessions from %s up to, not including, %s as %i',
        (from, to, expected) => {
            expect(TradingSessionCalendar.sessionsBetween(from, to)).toBe(
                expected,
            );
        },
    );

    it('rejects a malformed date when counting sessions', () => {
        expect(() =>
            TradingSessionCalendar.sessionsBetween('2026-02-30', WEDNESDAY),
        ).toThrow(RangeError);
    });

    it.each([
        [ReviewWeekday.Sunday, SUNDAY],
        [ReviewWeekday.Monday, MONDAY],
        [ReviewWeekday.Tuesday, TUESDAY],
        [ReviewWeekday.Wednesday, WEDNESDAY],
        [ReviewWeekday.Thursday, '2026-09-17'],
        [ReviewWeekday.Friday, FRIDAY],
        [ReviewWeekday.Saturday, SATURDAY],
    ])('the latest %s on or before Wednesday is %s', (weekday, expected) => {
        expect(
            TradingSessionCalendar.latestWeekdayOnOrBefore(WEDNESDAY, weekday),
        ).toBe(expected);
    });

    it('finds the latest review weekday on or before a date', () => {
        expect(
            TradingSessionCalendar.latestWeekdayOnOrBefore(
                WEDNESDAY,
                ReviewWeekday.Monday,
            ),
        ).toBe(MONDAY);
        expect(
            TradingSessionCalendar.latestWeekdayOnOrBefore(
                MONDAY,
                ReviewWeekday.Monday,
            ),
        ).toBe(MONDAY);
        expect(
            TradingSessionCalendar.latestWeekdayOnOrBefore(
                SUNDAY,
                ReviewWeekday.Monday,
            ),
        ).toBe('2026-09-14');
        expect(
            TradingSessionCalendar.latestWeekdayOnOrBefore(
                WEDNESDAY,
                ReviewWeekday.Friday,
            ),
        ).toBe(FRIDAY);
    });
});
