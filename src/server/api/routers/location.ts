import { type Device, type Location, Prisma, type Reading, type Recording } from '@prisma/client';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';

import type Result from '../result';

export const getLocationProps = z.object({ location_id: z.string() });

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
        return getLocation(input);
    }),
    getLocationDevices: publicProcedure.input(getLocationProps).query(async ({ input }) => {
        const location = await getLocation(input);
        if (!location.data) {
            return location;
        }

        const devices = await db.device.findMany({ where: { locationId: location.data.id } });
        return { data: devices } as Result<Device[]>;
    }),
    getLocationReadings: publicProcedure.input(getLocationProps).query(async ({ input }) => {
        const location = await getLocation(input);
        if (!location.data) {
            return location;
        }

        const devices = await db.device.findMany({ where: { locationId: location.data.id } });
        const readingsPromises = devices.map((device) => {
            return db.reading.findMany({ where: { deviceId: device.id } });
        });
        const readings: Reading[] = [];
        (await Promise.all(readingsPromises)).map((devices) => {
            devices.map((recording) => readings.push(recording));
        });
        return { data: readings } as Result<Reading[]>;
    }),
    getLocationRecordings: publicProcedure.input(getLocationProps).query(async ({ input }) => {
        const location = await getLocation(input);
        if (!location.data) {
            return location;
        }

        const devices = await db.device.findMany({ where: { locationId: location.data.id } });
        const recordingsPromises = devices.map((device) => {
            return db.recording.findMany({ where: { deviceId: device.id }, select: { id: true, createdAt: true, deviceId: true } });
        });
        const recordings: { id: number; createdAt: Date; deviceId: number }[] = [];
        (await Promise.all(recordingsPromises)).map((devices) => {
            devices.map((recording) => recordings.push(recording));
        });
        return { data: recordings } as Result<Recording[]>;
    }),
});
