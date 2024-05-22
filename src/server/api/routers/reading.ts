import { Prisma, type Reading } from '@prisma/client';
import { format } from 'date-fns';
import { z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import type Result from '~/types/result';
import {
    createReadingProps,
    getLocationProps,
    type getReadingProps,
} from '~/types/zod';

import { getDevice } from './device';
import { getEnabledSensors } from './sensor';
import { type GetReadingsRecord, type ReadingRecord } from '../types/types';

export async function getReading(
    input: z.infer<typeof getReadingProps>,
    ctx: ContextType,
): Promise<Result<Reading>> {
    try {
        const reading = await ctx.db.reading.findUniqueOrThrow({
            where: { id: +input.id },
        });
        return { data: reading };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return {
                    error: `Reading id ${input.id} not found`,
                    status: 404,
                };
            }
        }
        return { error: e, status: 500 };
    }
}

export const readingRouter = createTRPCRouter({
    getReadings: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.reading.findMany() } as Result<Reading[]>;
    }),
    getReading: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            return await getReading(input, ctx);
        }),
    createReading: publicProcedure
        .input(createReadingProps)
        .mutation(async ({ input, ctx }) => {
            const readings: Reading[] = [];

            const device = await getDevice(
                { device_id: input.device_id.toString() },
                ctx,
            );

            if (!device.data) {
                return device;
            }

            for (const sensor in input.sensors) {
                const value = input.sensors[sensor];
                if (value == undefined) {
                    return {
                        error: `No value provided for sensor ${sensor}`,
                        status: 400,
                    };
                }

                readings.push(
                    await ctx.db.reading.create({
                        data: {
                            device_id: device.data.id,
                            sensor_id: +sensor,
                            location_id: +device.data.location_id,
                            value: +value,
                        },
                    }),
                );
            }

            return { data: readings, status: 201 } as Result<Reading[]>;
        }),
    getReadingsLatest: publicProcedure
        .input(getLocationProps)
        .query(async ({ input, ctx }): Promise<Result<GetReadingsRecord[]>> => {
            const sensors = await getEnabledSensors(ctx);
            if (!sensors.data) {
                return {};
            }

            const period = 24;
            const readings = await ctx.db.reading.findMany({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - period * 60 * 60 * 1000),
                    },
                    location_id: input.location_id
                        ? +input.location_id
                        : undefined,
                    sensor_id: { in: sensors.data.map((sensor) => sensor.id) },
                },
                select: {
                    createdAt: true,
                    value: true,
                    sensor_id: true,
                },
                orderBy: {
                    id: 'asc',
                },
            });

            if (readings.length === 0) {
                return {
                    error: 'No readings could be found',
                };
            }

            const readingsRecord: GetReadingsRecord[] = [];
            sensors.data.map((sensor) => {
                const filteredReadings: ReadingRecord[] = readings
                    .filter((reading) => {
                        return reading.sensor_id === sensor.id;
                    })
                    .map((reading) => {
                        return {
                            date: format(reading.createdAt, 'H:mm'),
                            value: reading.value,
                            sensor_id: reading.sensor_id,
                        };
                    });

                const lastReading = filteredReadings.at(-1);
                if (lastReading) {
                    return readingsRecord.push({
                        readings: filteredReadings,
                        latestReading: lastReading,
                        sensor: sensor,
                        highest: Math.max(
                            ...filteredReadings.map((reading) => reading.value),
                        ),
                        lowest: Math.min(
                            ...filteredReadings.map((reading) => reading.value),
                        ),
                        period: period,
                    });
                }
            });

            return {
                data: readingsRecord,
            };
        }),
    // getReadingsLatest2: publicProcedure
    //     .input(getLocationProps)
    //     .query(async ({ input, ctx }): Promise<Result<GetReadingsRecord[]>> => {
    //         const sensors = await getEnabledSensors(ctx);
    //         if (!sensors.data) {
    //             return {};
    //         }

    //         const period = 24;
    //         const periodInMs = period * 60 * 60 * 1000;

    //         const fetchReadings = async (
    //             sensors: Sensor[],
    //             startTime: Date,
    //             endTime?: Date,
    //         ) => {
    //             return await ctx.db.reading.findMany({
    //                 where: {
    //                     createdAt: {
    //                         gte: startTime,
    //                         ...(endTime ? { lte: endTime } : {}),
    //                     },
    //                     location_id: input.location_id
    //                         ? +input.location_id
    //                         : undefined,
    //                     sensor_id: {
    //                         in: sensors.map((sensor) => sensor.id),
    //                     },
    //                 },
    //                 select: {
    //                     createdAt: true,
    //                     value: true,
    //                     sensor_id: true,
    //                 },
    //                 orderBy: {
    //                     id: 'desc',
    //                 },
    //             });
    //         };

    //         let readings = await fetchReadings(
    //             sensors.data,
    //             new Date(Date.now() - periodInMs),
    //         );

    //         if (readings.length === 0) {
    //             const latestReading = await ctx.db.reading.findFirst({
    //                 where: {
    //                     location_id: input.location_id
    //                         ? +input.location_id
    //                         : undefined,
    //                     sensor_id: {
    //                         in: sensors.data.map((sensor) => sensor.id),
    //                     },
    //                 },
    //                 select: {
    //                     createdAt: true,
    //                 },
    //                 orderBy: {
    //                     createdAt: 'desc',
    //                 },
    //             });

    //             if (latestReading) {
    //                 readings = await fetchReadings(
    //                     sensors.data,
    //                     new Date(
    //                         latestReading.createdAt.getTime() - periodInMs,
    //                     ),
    //                     latestReading.createdAt,
    //                 );
    //             } else {
    //                 return {
    //                     error: 'No readings could be found',
    //                 };
    //             }
    //         }

    //         const readingsRecord: GetReadingsRecord[] = [];
    //         sensors.data.map((sensor) => {
    //             const filteredReadings: ReadingRecord[] = readings
    //                 .filter((reading) => {
    //                     return reading.sensor_id === sensor.id;
    //                 })
    //                 .map((reading) => [
    //                     // format(reading.createdAt, 'H:mm'),
    //                     reading.createdAt,
    //                     reading.value,
    //                 ]);

    //             const lastReading = filteredReadings.at(-1);
    //             if (lastReading) {
    //                 return readingsRecord.push({
    //                     readings: filteredReadings,
    //                     latestReading: lastReading,
    //                     sensor: sensor,
    //                     highest: Math.max(
    //                         ...filteredReadings.map((reading) => reading[1]),
    //                     ),
    //                     lowest: Math.min(
    //                         ...filteredReadings.map((reading) => reading[1]),
    //                     ),
    //                     period: period,
    //                 });
    //             }
    //         });

    //         return {
    //             data: readingsRecord,
    //         };
    //     }),
});
