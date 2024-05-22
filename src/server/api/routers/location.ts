import {
    type Device,
    type Location,
    Prisma,
    type Reading,
    type Recording,
} from '@prisma/client';
import { z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { getRecordingsNoFileSelect } from '~/types/db';
import type Result from '~/types/result';
import { getLocationProps, getLocationReadingsProps } from '~/types/zod';

import { getSensor } from './sensor';

export async function getLocation(
    input: z.infer<typeof getLocationProps>,
    ctx: ContextType,
): Promise<Result<Location>> {
    try {
        const location = await ctx.db.location.findUniqueOrThrow({
            where: { location_id: +input.location_id },
        });
        return { data: location };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return {
                    error: `Location id ${input.location_id} not found`,
                    status: 404,
                };
            }
        }
        return { error: e, status: 500 };
    }
}

export const locationRouter = createTRPCRouter({
    getLocations: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.location.findMany() } as Result<Location[]>;
    }),
    getLocation: publicProcedure
        .input(z.object({ location_id: z.string() }))
        .query(async ({ input, ctx }) => {
            return await getLocation(input, ctx);
        }),
    getLocationsWithReading: publicProcedure.query(async ({ ctx }) => {
        const period = 24;
        return {
            data: await ctx.db.location.findMany({
                where: {
                    readings: {
                        some: {
                            createdAt: {
                                gte: new Date(
                                    Date.now() - period * 60 * 60 * 1000,
                                ),
                            },
                        },
                    },
                },
            }),
        } as Result<Location[]>;
    }),
    getLocationFirstWithReading: publicProcedure.query(async ({ ctx }) => {
        return {
            data: await ctx.db.location.findFirst({
                where: { readings: { some: {} } },
            }),
        } as Result<Location>;
    }),
    getLocationDevices: publicProcedure
        .input(getLocationProps)
        .query(async ({ input, ctx }) => {
            const location = await getLocation(input, ctx);
            if (!location.data) {
                return location;
            }

            const devices = await ctx.db.device.findMany({
                where: { location_id: location.data.id },
            });

            return { data: devices } as Result<Device[]>;
        }),
    getLocationReadings: publicProcedure
        .input(getLocationReadingsProps)
        .query(async ({ input, ctx }) => {
            const location = await getLocation(
                { location_id: input.location.location_id },
                ctx,
            );

            if (!location.data) {
                return location;
            }

            if (input.sensor_id) {
                const sensor = await getSensor({ id: input.sensor_id }, ctx);
                if (!sensor.data) {
                    return { error: sensor.error, status: sensor.status };
                }
            }

            const readings = await ctx.db.reading.findMany({
                where: {
                    location_id: input.location?.location_id
                        ? +input.location.location_id
                        : undefined,
                    sensor_id: input.sensor_id ? +input.sensor_id : undefined,
                },
            });

            return {
                data: readings,
            } as Result<Reading[]>;
        }),
    getLocationRecordings: publicProcedure
        .input(getLocationProps)
        .query(async ({ input, ctx }) => {
            const location = await getLocation(
                { location_id: input.location_id },
                ctx,
            );

            if (!location.data) {
                return location;
            }

            const recordings = await ctx.db.recording.findMany({
                where: { location_id: +location.data.id },
                select: getRecordingsNoFileSelect,
            });

            return { data: recordings } as Result<Recording[]>;
        }),
});
