import {
    isSnapshotStale,
    ReviewWeekday,
    type SizingStage,
} from '~/lib/prop-calculator/advisor';

import {
    addIsoDays,
    dayNumberOf,
    DAYS_PER_WEEK,
    isoDateOfDay,
    isoDaysBetween,
    isWeekendDay,
    UtcWeekday,
    utcWeekdayOfDay,
    weekdaysInRange,
} from '../core';
import { AlertDisclosure } from './AccountAlert';

export interface SessionDate {
    readonly date: string;
    readonly disclosure: AlertDisclosure.NoHolidayCalendar;
}

function weekdayIndex(weekday: ReviewWeekday): UtcWeekday {
    switch (weekday) {
        case ReviewWeekday.Friday: {
            return UtcWeekday.Friday;
        }
        case ReviewWeekday.Monday: {
            return UtcWeekday.Monday;
        }
        case ReviewWeekday.Saturday: {
            return UtcWeekday.Saturday;
        }
        case ReviewWeekday.Sunday: {
            return UtcWeekday.Sunday;
        }
        case ReviewWeekday.Thursday: {
            return UtcWeekday.Thursday;
        }
        case ReviewWeekday.Tuesday: {
            return UtcWeekday.Tuesday;
        }
        case ReviewWeekday.Wednesday: {
            return UtcWeekday.Wednesday;
        }
    }
}

export const TradingSessionCalendar = {
    addDays: addIsoDays,
    daysBetween: isoDaysBetween,
    disclosure: AlertDisclosure.NoHolidayCalendar,
    isStale: (
        stage: SizingStage,
        asOf: string,
        today: string,
        fundedStaleDays: number,
    ): boolean => isSnapshotStale(stage, asOf, today, fundedStaleDays),
    lastSessionBefore: (today: string): SessionDate => {
        let day = dayNumberOf(today) - 1;
        while (isWeekendDay(day)) day -= 1;
        return {
            date: isoDateOfDay(day),
            disclosure: AlertDisclosure.NoHolidayCalendar,
        };
    },
    latestWeekdayOnOrBefore: (
        today: string,
        weekday: ReviewWeekday,
    ): string => {
        const day = dayNumberOf(today);
        const back =
            (utcWeekdayOfDay(day) - weekdayIndex(weekday) + DAYS_PER_WEEK) %
            DAYS_PER_WEEK;
        return isoDateOfDay(day - back);
    },
    requireDate: (date: string): string => isoDateOfDay(dayNumberOf(date)),
    sessionsBetween: (from: string, to: string): number =>
        weekdaysInRange(dayNumberOf(from), dayNumberOf(to)),
};
