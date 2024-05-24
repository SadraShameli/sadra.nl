import { z } from 'zod';

import {
  type ContextType,
  createTRPCRouter,
  publicProcedure,
} from '~/server/api/trpc';
import { type Result } from '../types/types';
import { getLocationProps, getLocationReadingsProps } from '..//types/zod';

import { getSensor } from './sensor';
import {
  type device,
  location,
  reading,
  type recording,
} from '~/server/db/schema';
import { and, eq, gte, desc } from 'drizzle-orm';

export async function getLocation(
  input: z.infer<typeof getLocationProps>,
  ctx: ContextType,
): Promise<Result<typeof location.$inferSelect>> {
  const result = await ctx.db.query.location.findFirst({
    where: (location) => eq(location.locationId, +input.location_id),
  });

  if (!result) {
    return {
      error: `Location id ${input.location_id} not found`,
      status: 404,
    };
  }

  return { data: result };
}

export const locationRouter = createTRPCRouter({
  getLocations: publicProcedure.query(async ({ ctx }) => {
    return { data: await ctx.db.query.location.findMany() } as Result<
      (typeof location.$inferSelect)[]
    >;
  }),
  getLocation: publicProcedure
    .input(z.object({ location_id: z.string() }))
    .query(async ({ input, ctx }) => {
      return await getLocation(input, ctx);
    }),
  getLocationsWithReading: publicProcedure.query(async ({ ctx }) => {
    const latestReading = await ctx.db
      .select()
      .from(reading)
      .orderBy(desc(reading.id))
      .limit(1);

    const latestReadingDate = latestReading?.[0]?.createdAt;
    if (!latestReadingDate) {
      return { error: 'There are no readings' } as Result<
        (typeof location.$inferSelect)[]
      >;
    }

    const period = 24;
    const locations = (
      await ctx.db
        .select({ location })
        .from(location)
        .innerJoin(
          reading,
          and(
            eq(location.id, reading.locationId),
            gte(
              reading.createdAt,
              new Date(
                latestReadingDate.getMilliseconds() - period * 60 * 60 * 1000,
              ),
            ),
          ),
        )
        .groupBy(location.id)
        .orderBy(location.id)
    ).map((result) => result.location);

    console.log(locations);

    return { data: locations } as Result<(typeof location.$inferSelect)[]>;
  }),
  getLocationDevices: publicProcedure
    .input(getLocationProps)
    .query(async ({ input, ctx }) => {
      const location = await getLocation(input, ctx);
      if (!location.data) {
        return location;
      }

      const devices = await ctx.db.query.device.findMany({
        where: (device) =>
          location.data ? eq(device.locationId, location.data.id) : undefined,
      });

      return { data: devices } as Result<(typeof device.$inferSelect)[]>;
    }),
  getLocationReadings: publicProcedure
    .input(getLocationReadingsProps)
    .query(async ({ input, ctx }) => {
      const location = await getLocation(
        { location_id: input.location.location_id },
        ctx,
      );

      if (!location.data) {
        return location;
      }

      if (input.sensor_id) {
        const sensor = await getSensor({ id: input.sensor_id }, ctx);
        if (!sensor.data) {
          return { error: sensor.error, status: sensor.status };
        }
      }

      const readings = await ctx.db.query.reading.findMany({
        where: (reading) =>
          and(
            location.data
              ? eq(reading.locationId, location.data.id)
              : undefined,
            input?.sensor_id
              ? eq(reading.sensorId, +input.sensor_id)
              : undefined,
          ),
      });

      return {
        data: readings,
      } as Result<(typeof reading.$inferSelect)[]>;
    }),
  getLocationRecordings: publicProcedure
    .input(getLocationProps)
    .query(async ({ input, ctx }) => {
      const location = await getLocation(
        { location_id: input.location_id },
        ctx,
      );

      if (!location.data) {
        return location;
      }

      const recordings = await ctx.db.query.recording.findMany({
        where: (recording) =>
          location.data
            ? eq(recording.locationId, location.data.id)
            : undefined,
        columns: {
          id: true,
          createdAt: true,
          locationId: true,
          deviceId: true,
          fileName: true,
        },
      });

      return { data: recordings } as Result<(typeof recording.$inferSelect)[]>;
    }),
});
