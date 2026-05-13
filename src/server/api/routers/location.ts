import { and, desc, eq, gte } from 'drizzle-orm';
import { type z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { location, reading, type recording } from '~/server/db/schemas/main';

import { getLocationProps, getLocationReadingsProps } from '..//types/zod';
import { type Result } from '../types/types';
import { getSensor } from './sensor';

async function getLocation(
    input: z.infer<typeof getLocationProps>,
    ctx: ContextType,
): Promise<Result<typeof location.$inferSelect>> {
    const res = await ctx.db.query.location.findFirst({
        where: (location) => eq(location.location_id, input.location_id),
    });

    if (!res) {
        return {
            error: `Location id ${input.location_id} not found`,
            status: 404,
        };
    }

    return { data: res };
}

export const locationRouter = createTRPCRouter({
    getLocation: publicProcedure
        .input(getLocationProps)
        .query(async ({ ctx, input }) => {
            return await getLocation(input, ctx);
        }),

    getLocationDevices: publicProcedure
        .input(getLocationProps)
        .query(async ({ ctx, input }) => {
            const location = await getLocation(input, ctx);
            if (!location.data) {
                return location;
            }

            const devices = await ctx.db.query.device.findMany({
                where: (device) =>
                    location.data
                        ? eq(device.location_id, location.data.id)
                        : undefined,
            });

            return { data: devices };
        }),

    getLocationReadings: publicProcedure
        .input(getLocationReadingsProps)
        .query(async ({ ctx, input }) => {
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

            const readings = await ctx.db.query.reading.findMany({
                where: (reading) =>
                    and(
                        location.data
                            ? eq(reading.location_id, location.data.id)
                            : undefined,
                        input.sensor_id
                            ? eq(reading.sensor_id, input.sensor_id)
                            : undefined,
                    ),
            });

            return {
                data: readings,
            };
        }),

    getLocationRecordings: publicProcedure
        .input(getLocationProps)
        .query(async ({ ctx, input }) => {
            const location = await getLocation(
                { location_id: input.location_id },
                ctx,
            );

            if (!location.data) {
                return location;
            }

            const recordings = await ctx.db.query.recording.findMany({
                columns: {
                    created_at: true,
                    device_id: true,
                    file_name: true,
                    id: true,
                    location_id: true,
                },
                where: (recording) =>
                    location.data
                        ? eq(recording.location_id, location.data.id)
                        : undefined,
            });

            return { data: recordings } as Result<
                (typeof recording.$inferSelect)[]
            >;
        }),

    getLocations: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.query.location.findMany() };
    }),

    getLocationsWithReading: publicProcedure.query(async ({ ctx }) => {
        const latestReading = await ctx.db
            .select()
            .from(reading)
            .orderBy(desc(reading.id))
            .limit(1);

        const latestReadingDate = latestReading.at(-1)?.created_at;
        if (!latestReadingDate) {
            return { error: 'There are no readings' };
        }

        const period = 24;
        const rows = await ctx.db
            .select({ location })
            .from(location)
            .innerJoin(
                reading,
                and(
                    eq(location.id, reading.location_id),
                    gte(
                        reading.created_at,
                        new Date(
                            latestReadingDate.getTime() -
                                period * 60 * 60 * 1000,
                        ),
                    ),
                ),
            )
            .groupBy(location.id)
            .orderBy(location.id);
        const locations = rows.map((result) => result.location);

        return { data: locations };
    }),
});
