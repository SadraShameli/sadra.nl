import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { buildDeviceEmail, fanOutEvent } from '~/lib/notify';
import {
    deviceCreateSchema,
    deviceUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import {
    adminProcedure,
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { device, location, type recording } from '~/server/db/schemas/main';

import { type GetDeviceProps, type Result } from '../types/types';
import {
    getDeviceProps,
    getDeviceReadingsProps,
    getDeviceRecordingsProps,
} from '../types/zod';
import { getOrCreatePlaceholderLocation } from './location';
import { getSensor } from './sensor';

export async function getOrCreateDevice(
    publicDeviceId: number,
    ctx: ContextType,
): Promise<{ created: boolean; id: number; locationId: number; name: string }> {
    const existing = await ctx.db.query.device.findFirst({
        where: (d) => eq(d.device_id, publicDeviceId),
    });
    if (existing) {
        return {
            created: false,
            id: existing.id,
            locationId: existing.location_id,
            name: existing.name,
        };
    }
    const placeholder = await getOrCreatePlaceholderLocation(ctx);
    const name = `Device ${publicDeviceId}`;
    const [inserted] = await ctx.db
        .insert(device)
        .values({
            device_id: publicDeviceId,
            location_id: placeholder.id,
            loudness_threshold: 0,
            name,
            register_interval: 0,
        })
        .returning({ id: device.id });
    if (!inserted) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to auto-provision device',
        });
    }

    fanOutEvent(
        'device_created',
        buildDeviceEmail({
            deviceId: publicDeviceId,
            deviceName: name,
            locationName: placeholder.name,
        }),
    ).catch((error: unknown) =>
        console.error('[device] auto-provision notify failed', error),
    );

    return {
        created: true,
        id: inserted.id,
        locationId: placeholder.id,
        name,
    };
}

async function getDevice(
    input: z.infer<typeof getDeviceProps>,
    ctx: ContextType,
): Promise<Result<GetDeviceProps>> {
    const res = await ctx.db.query.device.findFirst({
        where: (device) => eq(device.device_id, input.device_id),
    });

    if (!res)
        return {
            error: `Device id ${input.device_id} not found`,
            status: 404,
        };

    const sensorRows = await ctx.db.query.sensorsToDevices.findMany({
        where: (row) => eq(row.device_id, res.id),
    });
    const sensors = sensorRows.map((sensor) => sensor.sensor_id);

    return { data: { ...res, sensors: sensors } };
}

export const deviceRouter = createTRPCRouter({
    create: adminProcedure
        .input(deviceCreateSchema)
        .mutation(async ({ ctx, input }) => {
            const [loc] = await ctx.db
                .select({ id: location.id, name: location.name })
                .from(location)
                .where(eq(location.id, input.location_id))
                .limit(1);
            if (!loc) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Location not found',
                });
            }
            const [inserted] = await ctx.db
                .insert(device)
                .values({
                    device_id: input.device_id,
                    location_id: input.location_id,
                    loudness_threshold: input.loudness_threshold,
                    name: input.name,
                    register_interval: input.register_interval,
                })
                .returning({ id: device.id });

            fanOutEvent(
                'device_created',
                buildDeviceEmail({
                    deviceId: input.device_id,
                    deviceName: input.name,
                    locationName: loc.name,
                }),
            ).catch((error: unknown) =>
                console.error('[device] create notify failed', error),
            );

            return { id: inserted?.id };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(device).where(eq(device.id, input.id));
            return { ok: true };
        }),

    getDevice: publicProcedure
        .input(getDeviceProps)
        .query(async ({ ctx, input }) => {
            return await getDevice(input, ctx);
        }),

    getDeviceReadings: publicProcedure
        .input(getDeviceReadingsProps)
        .query(async ({ ctx, input }) => {
            const device = await getDevice(
                { device_id: input.device.device_id },
                ctx,
            );

            if (!device.data) {
                return device;
            }

            if (input.sensor_id) {
                const sensor = await getSensor({ id: input.sensor_id }, ctx);
                if (!sensor.data) {
                    return sensor;
                }

                const readings = await ctx.db.query.reading.findMany({
                    where: (reading) =>
                        and(
                            device.data
                                ? eq(reading.device_id, device.data.id)
                                : undefined,
                            sensor.data
                                ? eq(reading.sensor_id, sensor.data.id)
                                : undefined,
                        ),
                });

                const readingsRecord: [string, number][] = [];
                readings.map((reading) => {
                    readingsRecord.push([
                        `${reading.created_at.getHours()}:${reading.created_at.getMinutes()}`,
                        reading.value,
                    ]);
                });

                return { data: readingsRecord };
            }

            const readings = await ctx.db.query.reading.findMany({
                where: (reading) => {
                    return device.data
                        ? eq(reading.device_id, device.data.id)
                        : undefined;
                },
            });

            const readingsRecord: [string, number][] = [];
            readings.map((reading) => {
                readingsRecord.push([
                    `${reading.created_at.getHours()}:${reading.created_at.getMinutes()}`,
                    reading.value,
                ]);
            });

            return { data: readingsRecord };
        }),

    getDeviceRecordings: publicProcedure
        .input(getDeviceRecordingsProps)
        .query(async ({ ctx, input }) => {
            const device = await getDevice(
                { device_id: input.device.device_id },
                ctx,
            );

            if (!device.data) {
                return device;
            }

            const recordings = await ctx.db.query.recording.findMany({
                columns: {
                    created_at: true,
                    device_id: true,
                    file_name: true,
                    id: true,
                    location_id: true,
                },
                where: (recording) => {
                    return device.data
                        ? eq(recording.device_id, device.data.id)
                        : undefined;
                },
            });

            return { data: recordings } as Result<
                (typeof recording.$inferSelect)[]
            >;
        }),

    getDevices: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.query.device.findMany() };
    }),

    listAdmin: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.device.findMany({
            orderBy: (d, { asc }) => [asc(d.location_id), asc(d.device_id)],
        });
    }),

    update: adminProcedure
        .input(deviceUpdateSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            await ctx.db.update(device).set(rest).where(eq(device.id, id));
            return { ok: true };
        }),
});
