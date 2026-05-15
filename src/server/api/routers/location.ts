import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, max } from 'drizzle-orm';
import { z } from 'zod';

import { buildLocationEmail, fanOutEvent } from '~/lib/notify';
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
import { location, reading, type recording } from '~/server/db/schemas/main';

import { getLocationProps, getLocationReadingsProps } from '..//types/zod';
import { type Result } from '../types/types';
import { getSensor } from './sensor';

const PLACEHOLDER_LOCATION_NAME = 'Unassigned';

export async function getOrCreatePlaceholderLocation(
    ctx: ContextType,
): Promise<{ id: number; name: string }> {
    const existing = await ctx.db.query.location.findFirst({
        where: (l) => eq(l.name, PLACEHOLDER_LOCATION_NAME),
    });
    if (existing) {
        return { id: existing.id, name: existing.name };
    }
    const [maxRow] = await ctx.db
        .select({ value: max(location.location_id) })
        .from(location);
    const nextLocationId = (maxRow?.value ?? 0) + 1;
    const [inserted] = await ctx.db
        .insert(location)
        .values({
            location_id: nextLocationId,
            location_name: 'auto',
            name: PLACEHOLDER_LOCATION_NAME,
        })
        .returning({ id: location.id, name: location.name });
    if (!inserted) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create placeholder location',
        });
    }
    fanOutEvent(
        'location_created',
        buildLocationEmail({
            locationId: nextLocationId,
            locationName: PLACEHOLDER_LOCATION_NAME,
        }),
    ).catch((error: unknown) =>
        console.error('[location] auto-provision notify failed', error),
    );
    return { id: inserted.id, name: inserted.name };
}

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
    create: adminProcedure
        .input(locationCreateSchema)
        .mutation(async ({ ctx, input }) => {
            const [inserted] = await ctx.db
                .insert(location)
                .values(input)
                .returning({ id: location.id });
            fanOutEvent(
                'location_created',
                buildLocationEmail({
                    locationId: input.location_id,
                    locationName: input.name,
                }),
            ).catch((error: unknown) =>
                console.error('[location] create notify failed', error),
            );
            return { id: inserted?.id };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(location).where(eq(location.id, input.id));
            return { ok: true };
        }),

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
