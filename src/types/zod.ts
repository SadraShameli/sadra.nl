import { z } from 'zod';

export const getSensorProps = z.object({
    id: z.string(),
});

export const getLocationProps = z.object({ location_id: z.string() });
export const getLocationReadingsProps = z.object({
    location: getLocationProps,
    sensor_id: z.string().optional(),
});

export const getDeviceProps = z.object({ device_id: z.string() });
export const getDeviceReadingsProps = z.object({
    device: getDeviceProps,
    sensor_id: z.string().optional(),
});
export const getDeviceRecordingsProps = z.object({
    device: getDeviceProps,
    sensor_id: z.string().optional(),
});

export const getReadingProps = z.object({ id: z.string() });
export const createReadingProps = z.object({
    device_id: z.number(),
    sensors: z
        .record(z.string(), z.number())
        .refine((rec) => Object.keys(rec).length, {
            message: 'No sensor provided',
        }),
});

export const getRecordingProps = z.object({ id: z.string() });
export const createRecordingProps = z.object({
    device: getDeviceProps,
    recording: z.instanceof(Buffer).refine((buffer) => buffer.length, {
        message: 'No recording provided',
    }),
});
