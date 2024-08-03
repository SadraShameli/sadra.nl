import { type z } from 'zod';

import { type ContextType, createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { type sensor } from '~/server/db/schema';

import { type Result } from '../types/types';
import { getSensorProps } from '../types/zod';

export async function getSensors(ctx: ContextType): Promise<Result<(typeof sensor.$inferSelect)[]>> {
    const sensors = await ctx.db.query.sensor.findMany();
    return { data: sensors };
}

export async function getSensor(
    input: z.infer<typeof getSensorProps>,
    ctx: ContextType,
): Promise<Result<typeof sensor.$inferSelect>> {
    const result = await ctx.db.query.sensor.findFirst({
        where: (sensor, { eq }) => eq(sensor.id, +input.id),
    });

    if (!result)
        return {
            error: `Sensor id ${input.id} not found`,
            status: 404,
        };

    return { data: result };
}

export const sensorRouter = createTRPCRouter({
    getSensors: publicProcedure.query(async ({ ctx }) => {
        return getSensors(ctx);
    }),
    getSensor: publicProcedure.input(getSensorProps).query(async ({ input, ctx }) => {
        return await getSensor(input, ctx);
    }),
});
