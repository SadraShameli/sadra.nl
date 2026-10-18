import { addIsoDays, isoYearOf, todayIsoDate } from '~/lib/prop-calculator';

export {
    addCalendarYears,
    addIsoDays,
    dayNumberOf,
    CALENDAR_DAYS_PER_WEEK as DAYS_PER_WEEK,
    daysInIsoMonth,
    ISO_DATE_LENGTH,
    IsoDateError,
    isoDateOfDay,
    isoDaysBetween,
    isoMonthOf,
    isWeekendDay,
    MS_PER_DAY,
    todayIsoDate,
    UtcWeekday,
    utcWeekdayOfDay,
    weekdaysInRange,
} from '~/lib/prop-calculator';
export const MIN_ACCOUNT_DATE_YEAR = 2000;
export const MAX_ACCOUNT_DATE_YEAR = 2100;

export function compareText(a: string, b: string): number {
    if (a < b) return -1;
    return a > b ? 1 : 0;
}

export function isAccountDate(text: string): boolean {
    let year: number;
    try {
        year = isoYearOf(text);
    } catch {
        return false;
    }
    return year >= MIN_ACCOUNT_DATE_YEAR && year <= MAX_ACCOUNT_DATE_YEAR;
}

export function latestIsoDateAnywhere(now: Date): string {
    return addIsoDays(todayIsoDate(now), 1);
}
