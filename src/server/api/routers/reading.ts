import { Prisma, type Reading } from '@prisma/client';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';
import { createReadingProps, type getReadingProps } from '~/types/zod';

import { getDevice } from './device';
import type Result from '../result';

export async function getReading(input: z.infer<typeof getReadingProps>): Promise<Result<Reading>> {
    try {
        const reading = await db.reading.findUniqueOrThrow({ where: { id: +input.id } });
        return { data: reading };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return { error: `Reading id ${input.id} not found`, status: 404 };
            }
        }
        return { error: e, status: 500 };
    }
}

export const readingRouter = createTRPCRouter({
    getReadings: publicProcedure.query(async () => {
        return { data: await db.reading.findMany() } as Result<Reading[]>;
    }),
    getReading: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
        return await getReading(input);
    }),
    createReading: publicProcedure.input(createReadingProps).mutation(async ({ input }) => {
        const readings: Reading[] = [];
        for (const sensor in input.sensors) {
            const value = input.sensors[sensor];
            if (!value) {
                return { error: `No value provided for sensor ${sensor}`, status: 400 };
            }

            const device = await getDevice({ device_id: input.device_id.toString() });
            if (!device.data) {
                return device;
            }

            readings.push(await db.reading.create({ data: { device_id: device.data.id, sensor_id: +sensor, value: +value } }));
        }
        return { data: readings, status: 201 } as Result<Reading[]>;
    }),
});
