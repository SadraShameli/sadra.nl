import { z } from 'zod';

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
    unit: z.string().min(1).max(256),
});
export type SensorCreateInput = z.infer<typeof sensorCreateSchema>;

export const sensorUpdateSchema = z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(256),
    unit: z.string().min(1).max(256),
});
export type SensorUpdateInput = z.infer<typeof sensorUpdateSchema>;

export const recordingRenameSchema = z.object({
    file_name: z.string().min(1).max(256),
    id: z.number().int().positive(),
});
export type RecordingRenameInput = z.infer<typeof recordingRenameSchema>;

export const tradingPlanCreateSchema = z.object({
    name: z.string().min(1).max(256),
});
export type TradingPlanCreateInput = z.infer<typeof tradingPlanCreateSchema>;
