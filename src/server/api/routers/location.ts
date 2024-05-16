import { type Device, type Location, Prisma, type Reading, type Recording } from '@prisma/client';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';
import { getRecordingsNoFileSelect } from '~/types/db';
import { getLocationProps, getLocationReadingsProps } from '~/types/zod';

import { getSensor } from './sensor';
import type Result from '../result';

export async function getLocation(input: z.infer<typeof getLocationProps>): Promise<Result<Location>> {
    try {
        const location = await db.location.findUniqueOrThrow({ where: { location_id: +input.location_id } });
        return { data: location };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return { error: `Location id ${input.location_id} not found`, status: 404 };
            }
        }
        return { error: e, status: 500 };
    }
}

export const locationRouter = createTRPCRouter({
    getLocations: publicProcedure.query(async () => {
        return { data: await db.location.findMany() } as Result<Location[]>;
    }),
    getLocation: publicProcedure.input(z.object({ location_id: z.string() })).query(async ({ input }) => {
        return await getLocation(input);
    }),
    getLocationDevices: publicProcedure.input(getLocationProps).query(async ({ input }) => {
        const location = await getLocation(input);
        if (!location.data) {
            return location;
        }

        const devices = await db.device.findMany({ where: { location_id: location.data.id } });
        return { data: devices } as Result<Device[]>;
    }),
    getLocationReadings: publicProcedure.input(getLocationReadingsProps).query(async ({ input }) => {
        const location = await getLocation({ location_id: input.locationProps.location_id });
        if (!location.data) {
            return location;
        }

        const devices = await db.device.findMany({ where: { location_id: location.data.id } });
        const readings: Reading[] = [];
        const readingsRecord: [string, number][] = [];

        if (input.sensor_id) {
            const sensor = await getSensor({ sensor_id: input.sensor_id });
            if (!sensor.data) {
                return sensor;
            }

            const readingsPromises = devices.map((device) => {
                return db.reading.findMany({ where: { device_id: device.id, sensor_id: sensor.data?.id } });
            });

            (await Promise.all(readingsPromises)).map((readingsPromise) => {
                readingsPromise.map((reading) => readings.push(reading));
            });

            readings.map((reading) => {
                readingsRecord.push([`${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`, reading.value]);
            });

            return { data: readingsRecord } as Result<typeof readingsRecord>;
        }

        const readingsPromises = devices.map((device) => {
            return db.reading.findMany({ where: { device_id: device.id } });
        });

        (await Promise.all(readingsPromises)).map((readingsPromise) => {
            readingsPromise.map((reading) => readings.push(reading));
        });

        readings.map((reading) => {
            readingsRecord.push([`${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`, reading.value]);
        });

        return { data: readingsRecord } as Result<typeof readingsRecord>;
    }),
    getLocationRecordings: publicProcedure.input(getLocationReadingsProps).query(async ({ input }) => {
        const location = await getLocation({ location_id: input.locationProps.location_id });
        if (!location.data) {
            return location;
        }

        const devices = await db.device.findMany({ where: { location_id: location.data.id } });
        const recordingsPromises = devices.map((device) => {
            return db.recording.findMany({ where: { device_id: device.id }, select: getRecordingsNoFileSelect });
        });
        const recordings: { id: number; createdAt: Date; device_id: number }[] = [];
        (await Promise.all(recordingsPromises)).map((devices) => {
            devices.map((recording) => recordings.push(recording));
        });
        return { data: recordings } as Result<Recording[]>;
    }),
});
