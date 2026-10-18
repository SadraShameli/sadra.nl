import { z } from 'zod';

import {
    formChoiceIdSchema,
    formNonNegativeWholeNumberSchema,
    formNumberSchema,
    formPositiveWholeNumberSchema,
} from '~/lib/schemas/formNumber';

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
    location_id: formPositiveWholeNumberSchema(),
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
    device_id: formPositiveWholeNumberSchema(),
    location_id: formChoiceIdSchema(),
    loudness_threshold: formNonNegativeWholeNumberSchema(),
    name: z.string().min(1).max(256),
    register_interval: formNonNegativeWholeNumberSchema(),
});
export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;

export const deviceUpdateSchema = z.object({
    id: z.number().int().positive(),
    location_id: formChoiceIdSchema(),
    loudness_threshold: formNonNegativeWholeNumberSchema(),
    name: z.string().min(1).max(256),
    register_interval: formNonNegativeWholeNumberSchema(),
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
    deviceId: formChoiceIdSchema(),
    sensorId: formChoiceIdSchema(),
    value: formNumberSchema(),
});
export type ReadingCreateAdminInput = z.infer<typeof readingCreateAdminSchema>;

export const recordingCreateAdminSchema = z.object({
    deviceId: formChoiceIdSchema(),
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
