import type { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

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
