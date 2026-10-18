import { describe, expect, it } from 'vitest';

import { timeAxisOf } from '~/components/ui/chart/time-axis';

const HOUR_MS = 3_600_000;

describe('a time axis for a chart of readings', () => {
    const start = new Date(2026, 4, 14, 22, 0).getTime();
    const times = [
        start,
        start + 10 * HOUR_MS,
        start + 10.5 * HOUR_MS,
        start + 11 * HOUR_MS,
    ];
    const axis = timeAxisOf(times);

    it('spans exactly the first to the last reading on a linear time domain', () => {
        expect(axis?.domain).toEqual([start, start + 11 * HOUR_MS]);
    });

    it('spaces its ticks evenly in time, whatever the gaps between readings', () => {
        const ticks = axis?.ticks ?? [];
        const gaps = new Set(
            ticks.slice(1).map((tick, index) => tick - (ticks[index] ?? tick)),
        );
        expect(ticks.length).toBeGreaterThan(2);
        expect(gaps.size).toBe(1);
    });

    it('labels hours with a zero-padded clock', () => {
        expect(axis?.format(new Date(2026, 4, 15, 8, 0).getTime())).toBe(
            '15 May, 08:00',
        );
    });

    it('labels a month-long span by day', () => {
        const month = timeAxisOf([start, start + 30 * 24 * HOUR_MS]);
        expect(month?.format(new Date(2026, 4, 20, 0, 0).getTime())).toBe(
            '20 May',
        );
    });

    it('has no axis without readings', () => {
        expect(timeAxisOf([])).toBeNull();
    });
});
