import {
    CALENDAR_DAYS_PER_WEEK,
    SESSION_DAYS_PER_CALENDAR_WEEK,
} from '~/lib/prop-calculator';

export { CALENDAR_DAYS_PER_WEEK as DAYS_PER_WEEK } from '~/lib/prop-calculator';
export const ISO_DATE_LENGTH = 10;
export const MS_PER_DAY = 86_400_000;
export const MIN_ACCOUNT_DATE_YEAR = 2000;
export const MAX_ACCOUNT_DATE_YEAR = 2100;

const ISO_MONTH_LENGTH = 7;
const ISO_YEAR_LENGTH = 4;
const MONTHS_PER_YEAR = 12;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export enum UtcWeekday {
    Sunday = 0,
    Monday = 1,
    Tuesday = 2,
    Wednesday = 3,
    Thursday = 4,
    Friday = 5,
    Saturday = 6,
}

const EPOCH_WEEKDAY = UtcWeekday.Thursday;

export class IsoDateError extends RangeError {
    constructor(message: string) {
        super(message);
        this.name = 'IsoDateError';
    }
}

export function addCalendarYears(isoDate: string, years: number): string {
    dayNumberOf(isoDate);
    const year = Number(isoDate.slice(0, ISO_YEAR_LENGTH)) + years;
    const monthText = isoDate.slice(ISO_YEAR_LENGTH + 1, ISO_MONTH_LENGTH);
    const day = Number(isoDate.slice(ISO_MONTH_LENGTH + 1));
    const month = `${String(year).padStart(ISO_YEAR_LENGTH, '0')}-${monthText}`;
    const clampedDay = Math.min(day, daysInIsoMonth(month));
    return `${month}-${String(clampedDay).padStart(2, '0')}`;
}

export function addIsoDays(isoDate: string, days: number): string {
    return isoDateOfDay(dayNumberOf(isoDate) + days);
}

export function compareText(a: string, b: string): number {
    if (a < b) return -1;
    return a > b ? 1 : 0;
}

export function dayNumberOf(isoDate: string): number {
    const match = ISO_DATE_PATTERN.exec(isoDate);
    if (match === null) {
        throw new IsoDateError(`Not an ISO date (YYYY-MM-DD): "${isoDate}"`);
    }
    const [, year = '', month = '', day = ''] = match;
    const date = new Date(0);
    date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    const dayNumber = date.getTime() / MS_PER_DAY;
    if (isoDateOfDay(dayNumber) !== isoDate) {
        throw new IsoDateError(`Not a calendar date: "${isoDate}"`);
    }
    return dayNumber;
}

export function daysInIsoMonth(isoMonth: string): number {
    const match = ISO_MONTH_PATTERN.exec(isoMonth);
    const monthNumber = Number(match?.[2]);
    if (match === null || monthNumber < 1 || monthNumber > MONTHS_PER_YEAR) {
        throw new IsoDateError(`Not an ISO month (YYYY-MM): "${isoMonth}"`);
    }
    const lastDay = new Date(0);
    lastDay.setUTCFullYear(Number(match[1]), monthNumber, 0);
    return lastDay.getUTCDate();
}

export function isAccountDate(text: string): boolean {
    try {
        dayNumberOf(text);
    } catch {
        return false;
    }
    const year = Number(text.slice(0, ISO_YEAR_LENGTH));
    return year >= MIN_ACCOUNT_DATE_YEAR && year <= MAX_ACCOUNT_DATE_YEAR;
}

export function isoDateOfDay(day: number): string {
    return new Date(day * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
}

export function isoDaysBetween(from: string, to: string): number {
    return dayNumberOf(to) - dayNumberOf(from);
}

export function isoMonthOf(isoDate: string): string {
    dayNumberOf(isoDate);
    return isoDate.slice(0, ISO_MONTH_LENGTH);
}

export function isWeekendDay(day: number): boolean {
    const weekday = utcWeekdayOfDay(day);
    return weekday === UtcWeekday.Saturday || weekday === UtcWeekday.Sunday;
}

export function latestIsoDateAnywhere(now: Date): string {
    return addIsoDays(todayIsoDate(now), 1);
}

export function todayIsoDate(now: Date): string {
    return isoDateOfDay(Math.floor(now.getTime() / MS_PER_DAY));
}

export function utcWeekdayOfDay(day: number): UtcWeekday {
    return (
        (((day + EPOCH_WEEKDAY) % CALENDAR_DAYS_PER_WEEK) +
            CALENDAR_DAYS_PER_WEEK) %
        CALENDAR_DAYS_PER_WEEK
    );
}

export function weekdaysInRange(
    fromDay: number,
    toDayExclusive: number,
): number {
    if (toDayExclusive <= fromDay) return 0;
    const span = toDayExclusive - fromDay;
    const fullWeeks = Math.floor(span / CALENDAR_DAYS_PER_WEEK);
    let count = fullWeeks * SESSION_DAYS_PER_CALENDAR_WEEK;
    for (
        let day = fromDay + fullWeeks * CALENDAR_DAYS_PER_WEEK;
        day < toDayExclusive;
        day++
    ) {
        if (!isWeekendDay(day)) count += 1;
    }
    return count;
}
