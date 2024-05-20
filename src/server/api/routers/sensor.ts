import { Prisma, type Sensor } from '@prisma/client';
import { type z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import type Result from '~/types/result';
import { getSensorProps, getSensorReadingsProps } from '~/types/zod';

import { type GetSensorReadings, type ReadingsRecord } from '../types/types';

export async function getSensor(
    input: z.infer<typeof getSensorProps>,
    ctx: ContextType,
): Promise<Result<Sensor>> {
    try {
        const device = await ctx.db.sensor.findUniqueOrThrow({
            where: { id: +input.id },
        });
        return { data: device };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return {
                    error: `Sensor id ${input.id} not found`,
                    status: 404,
                };
            }
        }
        return { error: e, status: 500 };
    }
}

export const sensorRouter = createTRPCRouter({
    getSensors: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.sensor.findMany() } as Result<Sensor[]>;
    }),
    getSensor: publicProcedure
        .input(getSensorProps)
        .query(async ({ input, ctx }) => {
            return await getSensor(input, ctx);
        }),
    getEnabledSensors: publicProcedure.query(async ({ ctx }) => {
        return {
            data: await ctx.db.sensor.findMany({
                where: { enabled: true },
                orderBy: {
                    id: 'asc',
                },
            }),
        } as Result<Sensor[]>;
    }),
    getSensorReadings: publicProcedure
        .input(getSensorReadingsProps)
        .query(async ({ input, ctx }): Promise<Result<GetSensorReadings[]>> => {
            const period = 24;
            const sensors = await ctx.db.sensor.findMany({
                include: {
                    readings: true,
                },
                where: {
                    readings: {
                        every: {
                            createdAt: {
                                gte: new Date(
                                    Date.now() - period * 60 * 60 * 1000,
                                ),
                            },
                            location_id: input.location_id
                                ? +input.location_id
                                : undefined,
                            sensor_id: input.sensor_id
                                ? +input.sensor_id
                                : undefined,
                        },
                    },
                },
            });

            const sensorReadings: GetSensorReadings[] = [];
            sensors.map((sensor) => {
                const readingRecords = sensor.readings.map((reading) => [
                    `${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`,
                    reading.value,
                ]) as ReadingsRecord;

                return sensorReadings.push({
                    sensor: sensor,
                    readings: readingRecords,
                    highest: Math.max(
                        ...readingRecords.map((record) => record[1]),
                    ),
                    lowest: Math.min(
                        ...readingRecords.map((record) => record[1]),
                    ),
                    period: period,
                });
            });

            return {
                data: sensorReadings,
            };
        }),
});
