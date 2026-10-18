import {
    formatDisplayDayMonth,
    formatDisplayDayMonthTime,
    formatDisplayMonth,
} from '~/lib/format';

export interface TimeAxis {
    readonly domain: readonly [number, number];
    readonly format: (ms: number) => string;
    readonly ticks: readonly number[];
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

const TICK_STEPS_MS = [
    5 * MINUTE_MS,
    10 * MINUTE_MS,
    15 * MINUTE_MS,
    30 * MINUTE_MS,
    HOUR_MS,
    2 * HOUR_MS,
    3 * HOUR_MS,
    6 * HOUR_MS,
    12 * HOUR_MS,
    DAY_MS,
    2 * DAY_MS,
    7 * DAY_MS,
    MONTH_MS,
    3 * MONTH_MS,
] as const;

const LONGEST_STEP_MS = 3 * MONTH_MS;

const MAX_TICKS = 6;

export function timeAxisOf(times: readonly number[]): null | TimeAxis {
    if (times.length === 0) return null;
    const start = Math.min(...times);
    const end = Math.max(...times);
    const step =
        TICK_STEPS_MS.find(
            (candidate) => (end - start) / candidate <= MAX_TICKS,
        ) ?? LONGEST_STEP_MS;
    const ticks: number[] = [];
    for (let tick = Math.ceil(start / step) * step; tick <= end; tick += step) {
        ticks.push(tick);
    }
    return {
        domain: [start, end],
        format: (ms) => labelFormatOf(step)(new Date(ms)),
        ticks,
    };
}

function labelFormatOf(stepMs: number): (date: Date) => string {
    if (stepMs < DAY_MS) return formatDisplayDayMonthTime;
    return stepMs < MONTH_MS ? formatDisplayDayMonth : formatDisplayMonth;
}
