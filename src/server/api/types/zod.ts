import { z } from 'zod';

export const getSensorProps = z.object({
    id: z.number(),
});

export const getLocationProps = z.object({
    location_id: z.number(),
    date_from: z.date().optional(),
    date_to: z.date().optional(),
});

export const getLocationReadingsProps = z.object({
    location: getLocationProps,
    sensor_id: z.number().optional(),
});

export const getDeviceProps = z.object({ device_id: z.number() });

export const getDeviceReadingsProps = z.object({
    device: getDeviceProps,
    sensor_id: z.number().optional(),
});

export const getDeviceRecordingsProps = z.object({
    device: getDeviceProps,
    sensor_id: z.number().optional(),
});

export const getReadingProps = z.object({ id: z.number() });

export const createReadingProps = z.object({
    device_id: z.number(),
    sensors: z
        .record(z.string(), z.number())
        .refine((rec) => Object.keys(rec).length, {
            message: 'No sensor provided',
        }),
});

export const getRecordingProps = z.object({ id: z.number() });

export const createRecordingProps = z.object({
    device: getDeviceProps,
    recording: z.instanceof(Buffer).refine((buffer) => buffer.length, {
        message: 'No recording provided',
    }),
});
