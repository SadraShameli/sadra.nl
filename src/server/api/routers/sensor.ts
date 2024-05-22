import { Prisma, type Sensor } from '@prisma/client';
import { type z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import type Result from '~/types/result';
import { getSensorProps } from '~/types/zod';

export async function getSensors(ctx: ContextType): Promise<Result<Sensor[]>> {
    const sensors = await ctx.db.sensor.findMany();
    return { data: sensors };
}

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

export async function getEnabledSensors(
    ctx: ContextType,
): Promise<Result<Sensor[]>> {
    return {
        data: await ctx.db.sensor.findMany({
            where: {
                enabled: true,
                readings: { some: {} },
            },
            orderBy: {
                id: 'asc',
            },
        }),
    } as Result<Sensor[]>;
}

export const sensorRouter = createTRPCRouter({
    getSensors: publicProcedure.query(async ({ ctx }) => {
        return getSensors(ctx);
    }),
    getSensor: publicProcedure
        .input(getSensorProps)
        .query(async ({ input, ctx }) => {
            return await getSensor(input, ctx);
        }),
    getEnabledSensors: publicProcedure.query(async ({ ctx }) => {
        return getEnabledSensors(ctx);
    }),
});
