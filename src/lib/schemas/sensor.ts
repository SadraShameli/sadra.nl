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

export const locationRowSchema = createSelectSchema(location);
export type LocationRow = z.infer<typeof locationRowSchema>;

export const readingRowSchema = createSelectSchema(reading);
export type ReadingRow = z.infer<typeof readingRowSchema>;

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

export const readingsQueryProperties = z.object({
    date_from: z.date().optional(),
    date_to: z.date().optional(),
    device_id: z.number().int().positive().optional(),
    granularity: granularitySchema.default('hour'),
    location_id: z.number().int().positive(),
});

export const locationReadingsProperties = z.object({
    location: locationProperties,
    sensor_id: z.number().int().positive().optional(),
});

export const deviceProperties = z.object({
    device_id: z.number().int().positive(),
});

export const deviceReadingsProperties = z.object({
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
