import { z } from 'zod';

const unitValueSchema = z.string().min(1).max(32);

export const sensorUnitCreateSchema = z.object({
    value: unitValueSchema,
});
export type SensorUnitCreateInput = z.infer<typeof sensorUnitCreateSchema>;

export const sensorUnitUpdateSchema = z.object({
    id: z.number().int().positive(),
    value: unitValueSchema,
});
export type SensorUnitUpdateInput = z.infer<typeof sensorUnitUpdateSchema>;

export const sensorUnitIdSchema = z.object({
    id: z.number().int().positive(),
});

export const locationCreateSchema = z.object({
    location_id: z.number().int().positive(),
    location_name: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
});
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;

export const locationUpdateSchema = z.object({
    id: z.number().int().positive(),
    location_name: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
});
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;

export const deviceCreateSchema = z.object({
    device_id: z.number().int().positive(),
    location_id: z.number().int().positive(),
    loudness_threshold: z.number().int().nonnegative(),
    name: z.string().min(1).max(256),
    register_interval: z.number().int().nonnegative(),
});
export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;

export const deviceUpdateSchema = z.object({
    id: z.number().int().positive(),
    location_id: z.number().int().positive(),
    loudness_threshold: z.number().int().nonnegative(),
    name: z.string().min(1).max(256),
    register_interval: z.number().int().nonnegative(),
});
export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;

export const sensorCreateSchema = z.object({
    name: z.string().min(1).max(256),
    unit: unitValueSchema,
});
export type SensorCreateInput = z.infer<typeof sensorCreateSchema>;

export const sensorUpdateSchema = z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(256),
    unit: unitValueSchema,
});
export type SensorUpdateInput = z.infer<typeof sensorUpdateSchema>;

export const recordingRenameSchema = z.object({
    file_name: z.string().min(1).max(256),
    id: z.number().int().positive(),
});
export type RecordingRenameInput = z.infer<typeof recordingRenameSchema>;

export const readingCreateAdminSchema = z.object({
    deviceId: z.number().int().positive(),
    sensorId: z.number().int().positive(),
    value: z.number(),
});
export type ReadingCreateAdminInput = z.infer<typeof readingCreateAdminSchema>;

export const recordingCreateAdminSchema = z.object({
    deviceId: z.number().int().positive(),
    fileBase64: z.string().min(1).max(50_000_000),
    fileName: z.string().min(1).max(256),
});
export type RecordingCreateAdminInput = z.infer<
    typeof recordingCreateAdminSchema
>;

export const tradingPlanCreateSchema = z.object({
    name: z.string().min(1).max(256),
});
export type TradingPlanCreateInput = z.infer<typeof tradingPlanCreateSchema>;
