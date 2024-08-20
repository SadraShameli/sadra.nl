import { and, desc, eq, gte } from 'drizzle-orm';
import { type z } from 'zod';

import { type ContextType, createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { type device, location, reading, type recording } from '~/server/db/schema';

import { getSensor } from './sensor';
import { getLocationProps, getLocationReadingsProps } from '..//types/zod';
import { type Result } from '../types/types';

export async function getLocation(
    input: z.infer<typeof getLocationProps>,
    ctx: ContextType,
): Promise<Result<typeof location.$inferSelect>> {
    const result = await ctx.db.query.location.findFirst({
        where: (location) => eq(location.location_id, input.location_id),
    });

    if (!result) {
        return {
            error: `Location id ${input.location_id} not found`,
            status: 404,
        };
    }

    return { data: result };
}

export async function getDefaultLocation(ctx: ContextType): Promise<Result<typeof location.$inferSelect>> {
    const result = await ctx.db.query.location.findFirst();

    if (!result) {
        return {
            error: `No locations exist`,
            status: 404,
        };
    }

    return { data: result };
}

export const locationRouter = createTRPCRouter({
    getLocations: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.query.location.findMany() } as Result<(typeof location.$inferSelect)[]>;
    }),
    getLocation: publicProcedure.input(getLocationProps).query(async ({ input, ctx }) => {
        return await getLocation(input, ctx);
    }),
    getLocationsWithReading: publicProcedure.query(async ({ ctx }) => {
        const latestReading = await ctx.db.select().from(reading).orderBy(desc(reading.id)).limit(1);

        const latestReadingDate = latestReading.at(-1)?.created_at;
        if (!latestReadingDate) {
            return { error: 'There are no readings' } as Result<(typeof location.$inferSelect)[]>;
        }

        const period = 24;
        const locations = (
            await ctx.db
                .select({ location })
                .from(location)
                .innerJoin(
                    reading,
                    and(
                        eq(location.id, reading.location_id),
                        gte(reading.created_at, new Date(latestReadingDate.getTime() - period * 60 * 60 * 1000)),
                    ),
                )
                .groupBy(location.id)
                .orderBy(location.id)
        ).map((result) => result.location);

        return { data: locations } as Result<(typeof location.$inferSelect)[]>;
    }),
    getLocationDevices: publicProcedure.input(getLocationProps).query(async ({ input, ctx }) => {
        const location = await getLocation(input, ctx);
        if (!location.data) {
            return location;
        }

        const devices = await ctx.db.query.device.findMany({
            where: (device) => (location.data ? eq(device.location_id, location.data.id) : undefined),
        });

        return { data: devices } as Result<(typeof device.$inferSelect)[]>;
    }),
    getLocationReadings: publicProcedure.input(getLocationReadingsProps).query(async ({ input, ctx }) => {
        const location = await getLocation({ location_id: input.location.location_id }, ctx);

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
                    location.data ? eq(reading.location_id, location.data.id) : undefined,
                    input?.sensor_id ? eq(reading.sensor_id, input.sensor_id) : undefined,
                ),
        });

        return {
            data: readings,
        } as Result<(typeof reading.$inferSelect)[]>;
    }),
    getLocationRecordings: publicProcedure.input(getLocationProps).query(async ({ input, ctx }) => {
        const location = await getLocation({ location_id: input.location_id }, ctx);

        if (!location.data) {
            return location;
        }

        const recordings = await ctx.db.query.recording.findMany({
            where: (recording) => (location.data ? eq(recording.location_id, location.data.id) : undefined),
            columns: {
                id: true,
                created_at: true,
                location_id: true,
                device_id: true,
                file_name: true,
            },
        });

        return { data: recordings } as Result<(typeof recording.$inferSelect)[]>;
    }),
});
