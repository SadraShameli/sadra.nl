import { type Device, Prisma, type Recording } from '@prisma/client';
import { type z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { getRecordingsNoFileSelect } from '~/types/db';
import type Result from '~/types/result';
import {
    getDeviceProps,
    getDeviceReadingsProps,
    getDeviceRecordingsProps,
} from '~/types/zod';

import { getSensor } from './sensor';

export async function getDevice(
    input: z.infer<typeof getDeviceProps>,
    ctx: ContextType,
): Promise<Result<Device>> {
    try {
        const device = await ctx.db.device.findUniqueOrThrow({
            where: { device_id: +input.device_id },
        });
        return { data: device };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return {
                    error: `Device id ${input.device_id} not found`,
                    status: 404,
                };
            }
        }
        return { error: e, status: 500 };
    }
}

export const deviceRouter = createTRPCRouter({
    getDevices: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.device.findMany() } as Result<Device[]>;
    }),
    getDevice: publicProcedure
        .input(getDeviceProps)
        .query(async ({ input, ctx }) => {
            return await getDevice(input, ctx);
        }),
    getDeviceReadings: publicProcedure
        .input(getDeviceReadingsProps)
        .query(async ({ input, ctx }) => {
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

                const readings = await ctx.db.reading.findMany({
                    where: {
                        device_id: device.data.id,
                        sensor_id: sensor.data.id,
                    },
                });

                const readingsRecord: [string, number][] = [];
                readings.map((reading) => {
                    readingsRecord.push([
                        `${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`,
                        reading.value,
                    ]);
                });

                return { data: readingsRecord } as Result<
                    typeof readingsRecord
                >;
            }

            const readings = await ctx.db.reading.findMany({
                where: { device_id: device.data.id },
            });
            const readingsRecord: [string, number][] = [];

            readings.map((reading) => {
                readingsRecord.push([
                    `${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`,
                    reading.value,
                ]);
            });

            return { data: readingsRecord } as Result<typeof readingsRecord>;
        }),
    getDeviceRecordings: publicProcedure
        .input(getDeviceRecordingsProps)
        .query(async ({ input, ctx }) => {
            const device = await getDevice(
                { device_id: input.device.device_id },
                ctx,
            );

            if (!device.data) {
                return device;
            }

            const recordings = await ctx.db.recording.findMany({
                where: { device_id: device.data.id },
                select: getRecordingsNoFileSelect,
            });

            return { data: recordings } as Result<Recording[]>;
        }),
});
