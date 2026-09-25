import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type DeviceRow,
    finestGranularityForRange,
    type Granularity,
    granularitySchema,
    isReadingsSpanWithinCap,
    type PublicDevice,
    publicDeviceColumns,
    READINGS_SERIES_MAX_SPAN_MS,
    readingsQueryProperties,
} from '~/lib/schemas/sensor';

const DAY_MS = 24 * 60 * 60 * 1000;
const TO = new Date('2026-09-25T00:00:00Z');

function rangeOf(spanMs: number): { date_from: Date; date_to: Date } {
    return { date_from: new Date(TO.getTime() - spanMs), date_to: TO };
}

describe('PublicDevice', () => {
    it('rejects a full device row at the type level', () => {
        expectTypeOf<DeviceRow>().not.toExtend<PublicDevice>();
    });

    it('accepts a row projected with publicDeviceColumns', () => {
        expectTypeOf<
            Pick<DeviceRow, keyof typeof publicDeviceColumns>
        >().toExtend<PublicDevice>();
    });

    it('never lists a token column in the public projection', () => {
        expect(
            Object.keys(publicDeviceColumns).filter((key) =>
                key.startsWith('token'),
            ),
        ).toEqual([]);
    });
});

describe('READINGS_SERIES_MAX_SPAN_MS', () => {
    it('grows monotonically from finest to coarsest granularity', () => {
        const spans = granularitySchema.options.map(
            (granularity) => READINGS_SERIES_MAX_SPAN_MS[granularity],
        );
        expect(spans).toEqual(spans.toSorted((a, b) => a - b));
    });

    it('caps raw at 7 days and hour at 90 days', () => {
        expect(READINGS_SERIES_MAX_SPAN_MS.raw).toBe(7 * DAY_MS);
        expect(READINGS_SERIES_MAX_SPAN_MS.hour).toBe(90 * DAY_MS);
    });
});

describe('readingsQueryProperties date span', () => {
    it.each(granularitySchema.options)(
        'accepts a %s range exactly at the cap',
        (granularity: Granularity) => {
            const result = readingsQueryProperties.safeParse({
                ...rangeOf(READINGS_SERIES_MAX_SPAN_MS[granularity]),
                granularity,
                location_id: 3,
            });
            expect(result.success).toBe(true);
        },
    );

    it.each(granularitySchema.options)(
        'rejects a %s range one millisecond over the cap',
        (granularity: Granularity) => {
            const result = readingsQueryProperties.safeParse({
                ...rangeOf(READINGS_SERIES_MAX_SPAN_MS[granularity] + 1),
                granularity,
                location_id: 3,
            });
            expect(result.success).toBe(false);
            expect(result.error?.issues[0]?.path).toEqual(['date_to']);
        },
    );

    it('rejects an epoch-to-now range at the default granularity', () => {
        const result = readingsQueryProperties.safeParse({
            date_from: new Date(0),
            date_to: TO,
            location_id: 3,
        });
        expect(result.success).toBe(false);
    });

    it('rejects date_to before date_from', () => {
        const result = readingsQueryProperties.safeParse({
            date_from: TO,
            date_to: new Date(TO.getTime() - 1),
            granularity: 'raw',
            location_id: 3,
        });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(['date_to']);
    });

    it('accepts a single-day selection where date_from equals date_to', () => {
        expect(
            readingsQueryProperties.safeParse({
                date_from: TO,
                date_to: TO,
                granularity: 'raw',
                location_id: 3,
            }).success,
        ).toBe(true);
    });

    it('accepts an open-ended range and no range at all', () => {
        expect(
            readingsQueryProperties.safeParse({
                date_from: new Date(0),
                granularity: 'raw',
                location_id: 3,
            }).success,
        ).toBe(true);
        expect(
            readingsQueryProperties.safeParse({ location_id: 3 }).success,
        ).toBe(true);
    });
});

describe('isReadingsSpanWithinCap', () => {
    it('treats a missing bound as within the cap', () => {
        expect(isReadingsSpanWithinCap('raw', undefined, TO)).toBe(true);
        expect(isReadingsSpanWithinCap('raw', TO, undefined)).toBe(true);
    });

    it('rejects a span over the cap', () => {
        const { date_from, date_to } = rangeOf(8 * DAY_MS);
        expect(isReadingsSpanWithinCap('raw', date_from, date_to)).toBe(false);
        expect(isReadingsSpanWithinCap('hour', date_from, date_to)).toBe(true);
    });
});

describe('finestGranularityForRange', () => {
    it('returns raw when no range is chosen', () => {
        expect(finestGranularityForRange(undefined, undefined)).toBe('raw');
    });

    it('returns the finest granularity whose cap fits the span', () => {
        const { date_from, date_to } = rangeOf(30 * DAY_MS);
        expect(finestGranularityForRange(date_from, date_to)).toBe('hour');
        const year = rangeOf(365 * DAY_MS);
        expect(finestGranularityForRange(year.date_from, year.date_to)).toBe(
            'day',
        );
    });

    it('returns undefined when no granularity can serve the span', () => {
        const { date_from, date_to } = rangeOf(
            READINGS_SERIES_MAX_SPAN_MS.month + 1,
        );
        expect(finestGranularityForRange(date_from, date_to)).toBeUndefined();
    });
});
