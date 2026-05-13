import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    device,
    location,
    reading,
    recording,
    sensor,
} from '~/server/db/schemas/main';

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

export const getSensorProps = z.object({
    id: z.number().int().positive(),
});

export const getLocationProps = z.object({
    date_from: z.date().optional(),
    date_to: z.date().optional(),
    location_id: z.number().int().positive(),
});

export const getLocationReadingsProps = z.object({
    location: getLocationProps,
    sensor_id: z.number().int().positive().optional(),
});

export const getDeviceProps = z.object({
    device_id: z.number().int().positive(),
});

export const getDeviceReadingsProps = z.object({
    device: getDeviceProps,
    sensor_id: z.number().int().positive().optional(),
});

export const getDeviceRecordingsProps = z.object({
    device: getDeviceProps,
    sensor_id: z.number().int().positive().optional(),
});

export const getReadingProps = z.object({
    id: z.number().int().positive(),
});

export const createReadingProps = z.object({
    device_id: z.number().int().positive(),
    sensors: z
        .record(z.string(), z.number())
        .refine((rec) => Object.keys(rec).length, {
            message: 'No sensor provided',
        }),
});

export const getRecordingProps = z.object({
    id: z.number().int().positive(),
});

export const createRecordingProps = z.object({
    device: getDeviceProps,
    recording: z.instanceof(Buffer).refine((buffer) => buffer.length, {
        message: 'No recording provided',
    }),
});
