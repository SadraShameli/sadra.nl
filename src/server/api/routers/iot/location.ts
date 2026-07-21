import { and, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';

import { LocationCreatedEmail } from '~/lib/email';
import { fanOutEvent } from '~/lib/notify';
import { captureError } from '~/lib/observability/logger';
import {
    locationCreateSchema,
    locationUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import {
    adminProcedure,
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { type Result } from '~/server/api/types/types';
import {
    locationProperties,
    locationReadingsProperties,
} from '~/server/api/types/zod';
import { location, reading, type recording } from '~/server/db/schemas/iot';

import { getSensor } from './sensor';

const idInputSchema = z.object({ id: z.number().int().positive() });

async function getLocation(
    input: z.infer<typeof locationProperties>,
    context: ContextType,
): Promise<Result<typeof location.$inferSelect>> {
    const result = await context.db.query.location.findFirst({
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

export const locationRouter = createTRPCRouter({
    create: adminProcedure
        .input(locationCreateSchema)
        .mutation(async ({ ctx, input }) => {
            const [inserted] = await ctx.db
                .insert(location)
                .values(input)
                .returning({ id: location.id });
            void (async () => {
                try {
                    await fanOutEvent(
                        'location_created',
                        (to) =>
                            new LocationCreatedEmail(to, {
                                locationId: input.location_id,
                                locationName: input.name,
                            }),
                    );
                } catch (error: unknown) {
                    captureError(error, { tag: 'location.notify' });
                }
            })();
            return { id: inserted?.id };
        }),

    delete: adminProcedure
        .input(idInputSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(location).where(eq(location.id, input.id));
            return { ok: true };
        }),

    getLocation: publicProcedure
        .input(locationProperties)
        .query(async ({ ctx, input }) => {
            return await getLocation(input, ctx);
        }),

    getLocationDevices: publicProcedure
        .input(locationProperties)
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
        .input(locationReadingsProperties)
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
        .input(locationProperties)
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
        const sinceDate = new Date(
            latestReadingDate.getTime() - period * 60 * 60 * 1000,
        );
        const rows = await ctx.db
            .select({ location })
            .from(location)
            .innerJoin(
                reading,
                and(
                    eq(location.id, reading.location_id),
                    gte(reading.created_at, sinceDate),
                ),
            )
            .groupBy(location.id)
            .orderBy(location.id);
        const locations = rows.map((result) => result.location);

        return { data: locations };
    }),

    listAdmin: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.location.findMany({
            orderBy: (l, { asc }) => [asc(l.location_id)],
        });
    }),

    update: adminProcedure
        .input(locationUpdateSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            await ctx.db.update(location).set(rest).where(eq(location.id, id));
            return { ok: true };
        }),
});
