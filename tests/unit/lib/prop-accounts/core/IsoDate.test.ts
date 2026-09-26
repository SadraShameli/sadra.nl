import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    addCalendarYears,
    addIsoDays,
    compareText,
    dayNumberOf,
    DAYS_PER_WEEK,
    daysInIsoMonth,
    isAccountDate,
    ISO_DATE_LENGTH,
    IsoDateError,
    isoDateOfDay,
    isoDaysBetween,
    isoMonthOf,
    isWeekendDay,
    latestIsoDateAnywhere,
    MS_PER_DAY,
    todayIsoDate,
    UtcWeekday,
    utcWeekdayOfDay,
    weekdaysInRange,
} from '~/lib/prop-accounts/core';
import {
    CALENDAR_DAYS_PER_WEEK,
    SESSION_DAYS_PER_CALENDAR_WEEK,
} from '~/lib/prop-calculator/core';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const DATE_MODULE = 'src/lib/prop-accounts/core/IsoDate.ts';
const SCANNED_ROOTS = [
    'src/lib/prop-accounts',
    'src/lib/prop-calculator/advisor',
    'src/lib/schemas/propAccounts.ts',
];
const DATE_COPY_PATTERNS = [
    /86_?400_?000/,
    /\bMS_PER_DAY\s*=/,
    /getTime\(\) \/ MS_PER_DAY/,
    /\bISO_DATE_LENGTH\s*=/,
    /Date\.UTC\(/,
    /getUTCDay\(/,
    /getUTCDate\(/,
    /T00:00:00Z/,
    /\.slice\(0, 10\)/,
    /\.slice\(0, 7\)/,
    /function codeUnitOrder/,
    /\bDAYS_PER_WEEK\s*=/,
    /new Set\(\[0, 6\]\)/,
    /WEEKEND_DAYS/,
    /\bSATURDAY\s*=/,
    /\bSUNDAY\s*=/,
];

function sourceFiles(relative: string): string[] {
    const isFile = relative.endsWith('.ts');
    return isFile
        ? [relative]
        : readdirSync(path.join(REPO_ROOT, relative), { recursive: true })
              .map(String)
              .filter((name) => name.endsWith('.ts'))
              .map((name) => path.join(relative, name));
}

describe('IsoDate day numbers', () => {
    it('numbers days from the epoch and back', () => {
        expect(dayNumberOf('1970-01-01')).toBe(0);
        expect(dayNumberOf('1970-01-02')).toBe(1);
        expect(dayNumberOf('2026-09-26') - dayNumberOf('2026-09-01')).toBe(25);
        expect(isoDateOfDay(dayNumberOf('2026-09-26'))).toBe('2026-09-26');
        expect(MS_PER_DAY).toBe(86_400_000);
        expect(ISO_DATE_LENGTH).toBe(10);
    });

    it('rejects malformed and impossible dates with a typed error', () => {
        for (const bad of [
            'x',
            '2026-9-01',
            '2026-13-01',
            '2026-02-30',
            '',
            'yesterday',
            '2026-09-01T00:00:00Z',
            ' 2026-09-01',
        ]) {
            expect(() => dayNumberOf(bad), bad).toThrow(IsoDateError);
            expect(() => dayNumberOf(bad), bad).toThrow(RangeError);
        }
    });

    it('adds days and counts signed days across month and year ends', () => {
        expect(addIsoDays('2026-12-30', 3)).toBe('2027-01-02');
        expect(addIsoDays('2026-09-23', -5)).toBe('2026-09-18');
        expect(isoDaysBetween('2026-09-18', '2026-09-23')).toBe(5);
        expect(isoDaysBetween('2026-09-23', '2026-09-18')).toBe(-5);
        expect(isoDaysBetween('2026-03-01', '2026-04-01')).toBe(31);
        expect(() => addIsoDays('2026-02-30', 1)).toThrow(IsoDateError);
    });

    it('gives the UTC weekday of a day number, Sunday as 0', () => {
        expect(utcWeekdayOfDay(dayNumberOf('2026-09-20'))).toBe(0);
        expect(utcWeekdayOfDay(dayNumberOf('2026-09-21'))).toBe(1);
        expect(utcWeekdayOfDay(dayNumberOf('2026-09-26'))).toBe(6);
        expect(utcWeekdayOfDay(dayNumberOf('1969-12-31'))).toBe(3);
    });

    it('takes its days per week from the one calendar constant in the prop-calculator core', () => {
        expect(CALENDAR_DAYS_PER_WEEK).toBe(7);
        expect(DAYS_PER_WEEK).toBe(CALENDAR_DAYS_PER_WEEK);
        expect(
            readFileSync(path.join(REPO_ROOT, DATE_MODULE), 'utf8'),
        ).not.toMatch(/\b(?:CALENDAR_)?DAYS_PER_WEEK\s*=/);
    });

    it('takes its weekdays per week from the one session-week constant in the prop-calculator core', () => {
        expect(SESSION_DAYS_PER_CALENDAR_WEEK).toBe(5);
        expect(
            readFileSync(path.join(REPO_ROOT, DATE_MODULE), 'utf8'),
        ).not.toMatch(/\b[A-Z_]*_PER_(?:CALENDAR_)?WEEK\s*=/);
        const monday = dayNumberOf('2026-09-07');
        expect(
            weekdaysInRange(monday, monday + 3 * CALENDAR_DAYS_PER_WEEK),
        ).toBe(3 * SESSION_DAYS_PER_CALENDAR_WEEK);
    });

    it('names the UTC weekdays and the weekend once', () => {
        expect(DAYS_PER_WEEK).toBe(7);
        expect(utcWeekdayOfDay(dayNumberOf('2026-09-20'))).toBe(
            UtcWeekday.Sunday,
        );
        expect(utcWeekdayOfDay(dayNumberOf('2026-09-25'))).toBe(
            UtcWeekday.Friday,
        );
        const weekend = Array.from(
            { length: DAYS_PER_WEEK },
            (_, offset) => dayNumberOf('2026-09-21') + offset,
        ).filter((day) => isWeekendDay(day));
        expect(weekend.map((day) => isoDateOfDay(day))).toEqual([
            '2026-09-26',
            '2026-09-27',
        ]);
        expect(isWeekendDay(dayNumberOf('1969-12-28'))).toBe(true);
        expect(isWeekendDay(dayNumberOf('1969-12-29'))).toBe(false);
    });

    it('counts weekdays in a half-open day range', () => {
        const monday = dayNumberOf('2026-09-07');
        expect(weekdaysInRange(monday, monday + 7)).toBe(5);
        expect(weekdaysInRange(monday, monday + 14)).toBe(10);
        expect(weekdaysInRange(monday + 5, monday + 7)).toBe(0);
        expect(weekdaysInRange(monday + 4, monday + 8)).toBe(2);
        expect(weekdaysInRange(monday, monday)).toBe(0);
        expect(weekdaysInRange(monday + 3, monday)).toBe(0);
        expect(
            weekdaysInRange(
                dayNumberOf('2026-12-28'),
                dayNumberOf('2027-01-11'),
            ),
        ).toBe(10);
    });
});

describe('IsoDate months and years', () => {
    it('takes the month of a date and the days of a month', () => {
        expect(isoMonthOf('2026-09-26')).toBe('2026-09');
        expect(() => isoMonthOf('2026-02-30')).toThrow(IsoDateError);
        expect(daysInIsoMonth('2026-02')).toBe(28);
        expect(daysInIsoMonth('2028-02')).toBe(29);
        expect(daysInIsoMonth('2026-09')).toBe(30);
        expect(daysInIsoMonth('2026-12')).toBe(31);
        expect(() => daysInIsoMonth('2026-13')).toThrow(IsoDateError);
    });

    it('adds calendar years and clamps a leap day', () => {
        expect(addCalendarYears('2028-02-29', 1)).toBe('2029-02-28');
        expect(addCalendarYears('2026-09-26', 3)).toBe('2029-09-26');
        expect(addCalendarYears('2026-09-26', -3)).toBe('2023-09-26');
    });

    it('names today as the UTC calendar date of now', () => {
        expect(todayIsoDate(new Date('2026-09-26T00:00:00Z'))).toBe(
            '2026-09-26',
        );
        expect(todayIsoDate(new Date('2026-09-26T23:59:59.999Z'))).toBe(
            '2026-09-26',
        );
        expect(todayIsoDate(new Date('1969-12-31T12:00:00Z'))).toBe(
            '1969-12-31',
        );
    });

    it('names the latest calendar date in any time zone as the UTC day after now', () => {
        expect(latestIsoDateAnywhere(new Date('2026-09-26T23:30:00Z'))).toBe(
            '2026-09-27',
        );
        expect(latestIsoDateAnywhere(new Date('2026-12-31T01:00:00Z'))).toBe(
            '2027-01-01',
        );
    });

    it('accepts only real account dates from 2000 through 2100', () => {
        for (const good of ['2000-01-01', '2026-09-26', '2100-12-31']) {
            expect(isAccountDate(good), good).toBe(true);
        }
        for (const bad of [
            '1999-12-31',
            '2101-01-01',
            '2026-02-30',
            'yesterday',
            '0999-01-01',
        ]) {
            expect(isAccountDate(bad), bad).toBe(false);
        }
    });

    it('orders text by code unit', () => {
        expect(compareText('2026-09-01', '2026-10-01')).toBe(-1);
        expect(compareText('b', 'a')).toBe(1);
        expect(compareText('a', 'a')).toBe(0);
        expect(compareText('Z', 'a')).toBe(-1);
    });
});

describe('one date module', () => {
    it('leaves no copy of the ISO-day or weekday helpers outside IsoDate.ts', () => {
        const copies = SCANNED_ROOTS.flatMap(sourceFiles)
            .filter((file) => file !== DATE_MODULE)
            .flatMap((file) => {
                const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
                return DATE_COPY_PATTERNS.filter((pattern) =>
                    pattern.test(text),
                ).map((pattern) => `${file}: ${String(pattern)}`);
            });
        expect(copies).toEqual([]);
    });
});
