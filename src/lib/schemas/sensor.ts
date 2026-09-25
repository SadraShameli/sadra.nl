import { milliseconds } from 'date-fns';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    device,
    location,
    reading,
    recording,
    sensor,
} from '~/server/db/schemas/iot';

export const sensorRowSchema = createSelectSchema(sensor);
export type SensorRow = z.infer<typeof sensorRowSchema>;

export const deviceRowSchema = createSelectSchema(device);
export type DeviceRow = z.infer<typeof deviceRowSchema>;

export const publicDeviceColumns = {
    device_id: true,
    id: true,
    location_id: true,
    loudness_threshold: true,
    name: true,
    register_interval: true,
} as const;
export type PublicDevice = Partial<
    Record<Exclude<keyof DeviceRow, PublicDeviceColumn>, never>
> &
    Pick<DeviceRow, PublicDeviceColumn>;
type PublicDeviceColumn = keyof typeof publicDeviceColumns;

export const locationRowSchema = createSelectSchema(location);
export type LocationRow = z.infer<typeof locationRowSchema>;

export const readingRowSchema = createSelectSchema(reading);
export type ReadingRow = z.infer<typeof readingRowSchema>;

export const publicReadingColumns = {
    created_at: true,
    device_id: true,
    id: true,
    location_id: true,
    sensor_id: true,
    value: true,
} as const;

export const READINGS_PAGE_DEFAULT_LIMIT = 100;
export const READINGS_PAGE_MAX_LIMIT = 500;
export const READINGS_SERIES_MAX_POINTS = 10_000;

export const readingsPageProperties = z.object({
    cursor: z.number().int().positive().optional(),
    limit: z
        .number()
        .int()
        .min(1)
        .max(READINGS_PAGE_MAX_LIMIT)
        .default(READINGS_PAGE_DEFAULT_LIMIT),
});

export const recordingRowSchema = createSelectSchema(recording);
export type RecordingRow = z.infer<typeof recordingRowSchema>;

export const readingInsertSchema = createInsertSchema(reading);
export type ReadingInsert = z.infer<typeof readingInsertSchema>;

export const recordingInsertSchema = createInsertSchema(recording);
export type RecordingInsert = z.infer<typeof recordingInsertSchema>;

export const sensorProperties = z.object({
    id: z.number().int().positive(),
});

export const locationProperties = z.object({
    date_from: z.date().optional(),
    date_to: z.date().optional(),
    location_id: z.number().int().positive(),
});

export const granularitySchema = z.enum([
    'raw',
    'hour',
    'day',
    'week',
    'month',
]);
export type Granularity = z.infer<typeof granularitySchema>;

export const READINGS_SERIES_MAX_SPAN_MS: Record<Granularity, number> = {
    day: milliseconds({ years: 2 }),
    hour: milliseconds({ days: 90 }),
    month: milliseconds({ years: 10 }),
    raw: milliseconds({ days: 7 }),
    week: milliseconds({ years: 10 }),
};

export const READINGS_SERIES_LONGEST_SPAN_MS = Math.max(
    ...Object.values(READINGS_SERIES_MAX_SPAN_MS),
);

export function finestGranularityForRange(
    from: Date | undefined,
    to: Date | undefined,
): Granularity | undefined {
    return granularitySchema.options.find((granularity) =>
        isReadingsSpanWithinCap(granularity, from, to),
    );
}

export function isReadingsSpanWithinCap(
    granularity: Granularity,
    from: Date | undefined,
    to: Date | undefined,
): boolean {
    return (
        !from ||
        !to ||
        to.getTime() - from.getTime() <=
            READINGS_SERIES_MAX_SPAN_MS[granularity]
    );
}

export const readingsQueryProperties = z
    .object({
        date_from: z.date().optional(),
        date_to: z.date().optional(),
        device_id: z.number().int().positive().optional(),
        granularity: granularitySchema.default('hour'),
        location_id: z.number().int().positive(),
    })
    .superRefine((value, context) => {
        if (
            value.date_from &&
            value.date_to &&
            value.date_to < value.date_from
        ) {
            context.addIssue({
                code: 'custom',
                message: 'The end date must not be before the start date',
                path: ['date_to'],
            });
            return;
        }
        if (
            !isReadingsSpanWithinCap(
                value.granularity,
                value.date_from,
                value.date_to,
            )
        ) {
            context.addIssue({
                code: 'custom',
                message: `The date range is too long for ${value.granularity} granularity`,
                path: ['date_to'],
            });
        }
    });

export const locationReadingsProperties = readingsPageProperties.extend({
    location: locationProperties,
    sensor_id: z.number().int().positive().optional(),
});

export const deviceProperties = z.object({
    device_id: z.number().int().positive(),
});

export const deviceReadingsProperties = readingsPageProperties.extend({
    device: deviceProperties,
    sensor_id: z.number().int().positive().optional(),
});

export const deviceRecordingsProperties = z.object({
    device: deviceProperties,
    sensor_id: z.number().int().positive().optional(),
});

export const readingProperties = z.object({
    id: z.number().int().positive(),
});

export const readingCreateProperties = z.object({
    device_id: z.number().int().positive(),
    sensors: z
        .record(z.string(), z.number())
        .refine((rec) => Object.keys(rec).length, {
            message: 'No sensor provided',
        }),
});

export const recordingProperties = z.object({
    id: z.number().int().positive(),
});

export const recordingCreateProperties = z.object({
    device: deviceProperties,
    duration_seconds: z.number().nonnegative().nullable(),
    recording: z.instanceof(Buffer).refine((buffer) => buffer.length, {
        message: 'No recording provided',
    }),
});
