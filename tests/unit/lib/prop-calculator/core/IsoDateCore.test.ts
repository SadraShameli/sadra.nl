import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as accountsCore from '~/lib/prop-accounts/core';
import * as calculatorCore from '~/lib/prop-calculator/core';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const CORE_DATE_MODULE = 'src/lib/prop-calculator/core/lib/isoDate.ts';
const ACCOUNTS_DATE_MODULE = 'src/lib/prop-accounts/core/IsoDate.ts';

const MOVED_HELPERS = [
    'addCalendarYears',
    'addIsoDays',
    'dayNumberOf',
    'daysInIsoMonth',
    'ISO_DATE_LENGTH',
    'IsoDateError',
    'isoDateOfDay',
    'isoDaysBetween',
    'isoMonthOf',
    'isWeekendDay',
    'MS_PER_DAY',
    'todayIsoDate',
    'UtcWeekday',
    'utcWeekdayOfDay',
    'weekdaysInRange',
] as const;

describe('the pure ISO-date helpers live in the prop-calculator core (PT-01d)', () => {
    it.each(MOVED_HELPERS)(
        'exports %s from the core barrel and re-exports the same value from prop-accounts',
        (name) => {
            const fromCore = (calculatorCore as Record<string, unknown>)[name];
            expect(fromCore).toBeDefined();
            expect((accountsCore as Record<string, unknown>)[name]).toBe(
                fromCore,
            );
        },
    );

    it('counts calendar days and weekdays from the core without prop-accounts', () => {
        const { dayNumberOf, isoDaysBetween, weekdaysInRange } = calculatorCore;
        expect(isoDaysBetween('2026-09-01', '2026-09-26')).toBe(25);
        const monday = dayNumberOf('2026-09-07');
        expect(weekdaysInRange(monday, monday + 14)).toBe(10);
        expect(() => dayNumberOf('2026-02-30')).toThrow(
            calculatorCore.IsoDateError,
        );
    });

    it('takes the week lengths from the core constants instead of redefining them', () => {
        const source = readFileSync(
            path.join(REPO_ROOT, CORE_DATE_MODULE),
            'utf8',
        );
        expect(source).toMatch(/CALENDAR_DAYS_PER_WEEK/);
        expect(source).toMatch(/SESSION_DAYS_PER_CALENDAR_WEEK/);
        expect(source).not.toMatch(/\b[A-Z_]*_PER_(?:CALENDAR_)?WEEK\s*=/);
    });

    it('leaves no second implementation in prop-accounts', () => {
        const source = readFileSync(
            path.join(REPO_ROOT, ACCOUNTS_DATE_MODULE),
            'utf8',
        );
        for (const name of MOVED_HELPERS) {
            expect(source, name).not.toMatch(
                new RegExp(
                    String.raw`(?:function|class|enum|const)\s+${name}\b`,
                ),
            );
        }
    });

    it('reads the year of an ISO date from the core and rejects an invalid date', () => {
        const { isoYearOf } = calculatorCore;
        expect(isoYearOf('2026-09-26')).toBe(2026);
        expect(isoYearOf('0999-01-01')).toBe(999);
        expect(() => isoYearOf('2026-13-01')).toThrow(
            calculatorCore.IsoDateError,
        );
    });

    it('keeps the ISO year length in the core module only', () => {
        const accounts = readFileSync(
            path.join(REPO_ROOT, ACCOUNTS_DATE_MODULE),
            'utf8',
        );
        const core = readFileSync(
            path.join(REPO_ROOT, CORE_DATE_MODULE),
            'utf8',
        );
        expect(accounts).not.toMatch(/ISO_YEAR_LENGTH/);
        expect(accounts).not.toMatch(/\.slice\(0,/);
        expect(core.match(/const ISO_YEAR_LENGTH\s*=/g)).toHaveLength(1);
    });
});
