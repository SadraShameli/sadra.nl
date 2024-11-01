import { and, eq } from 'drizzle-orm';
import { type z } from 'zod';

import { type ContextType, createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { type device, type recording } from '~/server/db/schema';

import { type GetDeviceProps, type Result } from '../types/types';
import { getDeviceProps, getDeviceReadingsProps, getDeviceRecordingsProps } from '../types/zod';
import { getSensor } from './sensor';

export async function getDevice(
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

    const sensors = (
        await ctx.db.query.sensorsToDevices.findMany({
            where: (row) => eq(row.device_id, res.id),
        })
    ).map((sensor) => sensor.sensor_id);

    return { data: { ...res, sensors: sensors } };
}

export const deviceRouter = createTRPCRouter({
    getDevices: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.query.device.findMany() } as Result<(typeof device.$inferSelect)[]>;
    }),

    getDevice: publicProcedure.input(getDeviceProps).query(async ({ input, ctx }) => {
        return await getDevice(input, ctx);
    }),

    getDeviceReadings: publicProcedure.input(getDeviceReadingsProps).query(async ({ input, ctx }) => {
        const device = await getDevice({ device_id: input.device.device_id }, ctx);

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
                        device.data ? eq(reading.device_id, device.data.id) : undefined,
                        sensor.data ? eq(reading.sensor_id, sensor.data.id) : undefined,
                    ),
            });

            const readingsRecord: [string, number][] = [];
            readings.map((reading) => {
                readingsRecord.push([
                    `${reading.created_at.getHours()}:${reading.created_at.getMinutes()}`,
                    reading.value,
                ]);
            });

            return { data: readingsRecord } as Result<typeof readingsRecord>;
        }

        const readings = await ctx.db.query.reading.findMany({
            where: (reading) => {
                return device.data ? eq(reading.device_id, device.data.id) : undefined;
            },
        });

        const readingsRecord: [string, number][] = [];
        readings.map((reading) => {
            readingsRecord.push([`${reading.created_at.getHours()}:${reading.created_at.getMinutes()}`, reading.value]);
        });

        return { data: readingsRecord } as Result<typeof readingsRecord>;
    }),

    getDeviceRecordings: publicProcedure.input(getDeviceRecordingsProps).query(async ({ input, ctx }) => {
        const device = await getDevice({ device_id: input.device.device_id }, ctx);

        if (!device.data) {
            return device;
        }

        const recordings = await ctx.db.query.recording.findMany({
            where: (recording) => {
                return device.data ? eq(recording.device_id, device.data.id) : undefined;
            },
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
