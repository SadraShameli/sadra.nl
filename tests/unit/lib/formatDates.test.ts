import { describe, expect, it } from 'vitest';

import {
    formatDisplayDate,
    formatDisplayDateRange,
    formatDisplayDateTime,
    formatDisplayMonth,
    formatDisplayTime,
    formatDisplayTimeWithSeconds,
    formatDisplayWeekdayDate,
} from '~/lib/format';

describe('display date formatting', () => {
    it('writes a calendar date as day, short month and year', () => {
        expect(formatDisplayDate('2026-10-18')).toBe('18 Oct 2026');
        expect(formatDisplayDate('2026-01-05')).toBe('5 Jan 2026');
    });

    it('keeps an ISO date on its own day in every time zone', () => {
        expect(formatDisplayDate('2026-03-01')).toBe('1 Mar 2026');
    });

    it('formats a Date or timestamp with a 24-hour time', () => {
        const at = new Date(2026, 9, 18, 8, 58);
        expect(formatDisplayDateTime(at)).toBe('18 Oct 2026, 08:58');
        expect(formatDisplayDateTime(at.toISOString())).toBe(
            '18 Oct 2026, 08:58',
        );
        expect(formatDisplayDate(at)).toBe('18 Oct 2026');
    });

    it('collapses a range inside one year', () => {
        expect(formatDisplayDateRange('2026-07-20', '2026-10-18')).toBe(
            '20 Jul – 18 Oct 2026',
        );
        expect(formatDisplayDateRange('2025-12-20', '2026-01-18')).toBe(
            '20 Dec 2025 – 18 Jan 2026',
        );
        expect(formatDisplayDateRange('2026-10-18', '2026-10-18')).toBe(
            '18 Oct 2026',
        );
    });

    it('formats a month key as short month and year', () => {
        expect(formatDisplayMonth('2026-10')).toBe('Oct 2026');
        expect(formatDisplayMonth('2026-10-18')).toBe('Oct 2026');
    });

    it('writes a time of day on a 24-hour clock', () => {
        const at = new Date(2026, 9, 18, 8, 58, 12);
        expect(formatDisplayTime(at)).toBe('08:58');
        expect(formatDisplayTimeWithSeconds(at)).toBe('08:58:12');
    });

    it('names the weekday in front of a date', () => {
        expect(formatDisplayWeekdayDate('2026-09-21')).toBe(
            'Monday 21 Sep 2026',
        );
    });
});
