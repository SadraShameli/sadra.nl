import { type z } from 'zod';
import { eq } from 'drizzle-orm';

import {
  type ContextType,
  createTRPCRouter,
  publicProcedure,
} from '~/server/api/trpc';
import { type Result } from '../types/types';
import { getSensorProps } from '../types/zod';
import { reading, sensor } from '~/server/db/schema';

export async function getSensors(
  ctx: ContextType,
): Promise<Result<(typeof sensor.$inferSelect)[]>> {
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

export async function getEnabledSensors(
  ctx: ContextType,
): Promise<Result<(typeof sensor.$inferSelect)[]>> {
  return {
    data: (
      await ctx.db
        .select({ sensor })
        .from(sensor)
        .where((result) => eq(result.sensor.enabled, true))
        .innerJoin(reading, eq(sensor.id, reading.sensor_id))
        .groupBy(sensor.id)
        .orderBy(sensor.id)
    ).map((result) => result.sensor),
  };
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
