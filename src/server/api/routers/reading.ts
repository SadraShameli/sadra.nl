import { Prisma, type Reading } from '@prisma/client';
import { z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import type Result from '~/types/result';
import { createReadingProps, type getReadingProps } from '~/types/zod';

import { getDevice } from './device';

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
                if (!value) {
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
    getReadingsLatest: publicProcedure.query(async ({ ctx }) => {
        const period = 24;
        const readings = await ctx.db.reading.findMany({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - period * 60 * 60 * 1000),
                },
            },
            select: {
                createdAt: true,
                value: true,
            },
        });

        return {
            data: {
                readings: readings,
            } as Result<Reading[]>,
        };
    }),
});
