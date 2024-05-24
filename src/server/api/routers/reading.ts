import { format } from 'date-fns';
import { z } from 'zod';

import {
  type ContextType,
  createTRPCRouter,
  publicProcedure,
} from '~/server/api/trpc';
import { type Result } from '../types/types';
import {
  createReadingProps,
  getLocationProps,
  type getReadingProps,
} from '../types/zod';

import { getDevice } from './device';
import { getEnabledSensors, getSensor } from './sensor';
import { type GetReadingsRecord, type ReadingRecord } from '../types/types';
import { reading } from '~/server/db/schema';
import { and, eq, gte, inArray, desc } from 'drizzle-orm';

export async function getReading(
  input: z.infer<typeof getReadingProps>,
  ctx: ContextType,
): Promise<Result<typeof reading.$inferSelect>> {
  const result = await ctx.db.query.reading.findFirst({
    where: (reading) => eq(reading.id, +input.id),
  });

  if (!result)
    return {
      error: `Reading id ${input.id} not found`,
      status: 404,
    };

  return { data: result };
}

export const readingRouter = createTRPCRouter({
  getReadings: publicProcedure.query(async ({ ctx }) => {
    return { data: await ctx.db.query.reading.findMany() } as Result<
      (typeof reading.$inferSelect)[]
    >;
  }),
  getReading: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return await getReading(input, ctx);
    }),
  createReading: publicProcedure
    .input(createReadingProps)
    .mutation(async ({ input, ctx }) => {
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

        const sensorResult = await getSensor({ id: sensor }, ctx);
        if (!sensorResult.data) {
          return sensorResult;
        }

        await ctx.db.insert(reading).values({
          sensor_id: +sensorResult.data.id,
          location_id: +device.data.location_id,
          device_id: device.data.id,
          value: +value,
        });
      }

      return { status: 201 } as Result<unknown>;
    }),
  getReadingsLatest: publicProcedure
    .input(getLocationProps)
    .query(async ({ input, ctx }): Promise<Result<GetReadingsRecord[]>> => {
      const sensors = await getEnabledSensors(ctx);
      if (!sensors.data) {
        return { error: sensors.error, status: sensors.status };
      }

      const latestReading = await ctx.db
        .select()
        .from(reading)
        .orderBy(desc(reading.id))
        .limit(1);

      const latestReadingDate = latestReading?.[0]?.created_at;
      if (!latestReadingDate) {
        return { error: 'There are no readings' } as Result<
          GetReadingsRecord[]
        >;
      }

      const period = 24;
      const readings = await ctx.db.query.reading.findMany({
        where: (reading) =>
          and(
            sensors.data
              ? inArray(
                  reading.sensor_id,
                  sensors.data.map((sensor) => sensor.id),
                )
              : undefined,
            eq(reading.location_id, +input.location_id),
            gte(
              reading.created_at,
              new Date(
                latestReadingDate.getMilliseconds() - period * 60 * 60 * 1000,
              ),
            ),
          ),
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
              date: format(reading.created_at, 'H:mm'),
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
});
