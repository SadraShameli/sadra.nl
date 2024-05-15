import { type Device, Prisma, type Reading, type Recording } from '@prisma/client';
import { type z } from 'zod';

import type Result from '~/server/api/result';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';
import { getRecordingsNoFileSelect } from '~/types/db';
import { getDeviceProps, getDeviceReadingsProps, getDeviceRecordingsProps } from '~/types/zod';

import { getSensor } from './sensor';

export async function getDevice(input: z.infer<typeof getDeviceProps>): Promise<Result<Device>> {
    try {
        const device = await db.device.findUniqueOrThrow({ where: { device_id: +input.device_id } });
        return { data: device };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return { error: `Device id ${input.device_id} not found`, status: 404 };
            }
        }
        return { error: e, status: 500 };
    }
}

export const deviceRouter = createTRPCRouter({
    getDevices: publicProcedure.query(async () => {
        return { data: await db.device.findMany() } as Result<Device[]>;
    }),
    getDevice: publicProcedure.input(getDeviceProps).query(async ({ input }) => {
        return await getDevice(input);
    }),
    getDeviceReadings: publicProcedure.input(getDeviceReadingsProps).query(async ({ input }) => {
        const device = await getDevice({ device_id: input.deviceProps.device_id });
        if (!device.data) {
            return device;
        }

        if (input.sensor_id) {
            const sensor = await getSensor({ sensor_id: input.sensor_id });
            if (!sensor.data) {
                return sensor;
            }
            const readings = await db.reading.findMany({ where: { deviceId: device.data.id, sensorId: sensor.data.id } });
            const readingsRecord: [string, number][] = [];
            readings.map((reading) => {
                readingsRecord.push([`${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`, reading.value]);
            });

            return { data: readingsRecord } as Result<typeof readingsRecord>;
        }

        const readings = await db.reading.findMany({ where: { deviceId: device.data.id } });
        return { data: readings } as Result<Reading[]>;
    }),
    getDeviceRecordings: publicProcedure.input(getDeviceRecordingsProps).query(async ({ input }) => {
        const device = await getDevice({ device_id: input.deviceProps.device_id });
        if (!device.data) {
            return device;
        }
        const recordings = await db.recording.findMany({
            where: { deviceId: device.data.id },
            select: getRecordingsNoFileSelect,
        });
        return { data: recordings } as Result<Recording[]>;
    }),
});
