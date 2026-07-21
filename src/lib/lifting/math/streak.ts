import { differenceInCalendarDays, startOfWeek, subWeeks } from 'date-fns';

import type { WeekStart } from '~/lib/lifting/types';

export class StreakAnalyzer {
    constructor(private readonly weekStart: WeekStart = 'mon') {}

    currentStreak(
        workoutDates: readonly Date[],
        now: Date = new Date(),
    ): number {
        const weeks = uniqueWeekStartTimes(workoutDates, this.weekStart);
        if (weeks.size === 0) return 0;

        const weekStartIndex = this.weekStart === 'mon' ? 1 : 0;
        let cursor = startOfWeek(now, { weekStartsOn: weekStartIndex });
        let streak = 0;

        while (weeks.has(cursor.getTime())) {
            streak += 1;
            cursor = subWeeks(cursor, 1);
        }

        if (streak === 0) {
            const prior = subWeeks(
                startOfWeek(now, { weekStartsOn: weekStartIndex }),
                1,
            );
            if (weeks.has(prior.getTime())) {
                cursor = prior;
                while (weeks.has(cursor.getTime())) {
                    streak += 1;
                    cursor = subWeeks(cursor, 1);
                }
            }
        }

        return streak;
    }

    longestStreak(workoutDates: readonly Date[]): number {
        const weekStarts = [
            ...uniqueWeekStartTimes(workoutDates, this.weekStart),
        ].toSorted((a, b) => a - b);
        if (weekStarts.length === 0) return 0;

        let best = 1;
        let run = 1;
        for (let index = 1; index < weekStarts.length; index++) {
            const previous = weekStarts[index - 1];
            const current = weekStarts[index];
            if (previous === undefined || current === undefined) continue;
            const days = differenceInCalendarDays(
                new Date(current),
                new Date(previous),
            );
            if (days === 7) {
                run += 1;
                if (run > best) best = run;
            } else {
                run = 1;
            }
        }

        return best;
    }

    sessionsPerWeek(
        workoutDates: readonly Date[],
        trailingWeeks: number,
        now: Date = new Date(),
    ): number {
        if (trailingWeeks <= 0) return 0;
        const weekStartIndex = this.weekStart === 'mon' ? 1 : 0;
        const from = subWeeks(
            startOfWeek(now, { weekStartsOn: weekStartIndex }),
            trailingWeeks - 1,
        );
        const count = workoutDates.filter(
            (d) => d.getTime() >= from.getTime(),
        ).length;
        return count / trailingWeeks;
    }
}

function uniqueWeekStartTimes(
    workoutDates: readonly Date[],
    weekStart: WeekStart,
): Set<number> {
    const weekStartIndex = weekStart === 'mon' ? 1 : 0;
    const out = new Set<number>();
    for (const d of workoutDates) {
        out.add(startOfWeek(d, { weekStartsOn: weekStartIndex }).getTime());
    }
    return out;
}
