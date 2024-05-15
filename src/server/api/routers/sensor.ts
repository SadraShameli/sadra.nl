import { Prisma, type Sensor } from '@prisma/client';
import { type z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';
import { getSensorProps } from '~/types/zod';

import type Result from '../result';

export async function getSensor(input: z.infer<typeof getSensorProps>): Promise<Result<Sensor>> {
    try {
        const device = await db.sensor.findUniqueOrThrow({ where: { sensor_id: +input.sensor_id } });
        return { data: device };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return { error: `Sensor id ${input.sensor_id} not found`, status: 404 };
            }
        }
        return { error: e, status: 500 };
    }
}

export const sensorRouter = createTRPCRouter({
    getSensors: publicProcedure.query(async () => {
        return { data: await db.sensor.findMany() } as Result<Sensor[]>;
    }),
    getSensor: publicProcedure.input(getSensorProps).query(async ({ input }) => {
        return await getSensor(input);
    }),
});
