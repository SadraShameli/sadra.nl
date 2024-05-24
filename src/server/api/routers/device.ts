import { type z } from 'zod';

import {
  type ContextType,
  createTRPCRouter,
  publicProcedure,
} from '~/server/api/trpc';
import { type Result } from '../types/types';
import {
  getDeviceProps,
  getDeviceReadingsProps,
  getDeviceRecordingsProps,
} from '../types/zod';

import { getSensor } from './sensor';
import { type recording, type device } from '~/server/db/schema';
import { and, eq } from 'drizzle-orm';

export async function getDevice(
  input: z.infer<typeof getDeviceProps>,
  ctx: ContextType,
): Promise<Result<typeof device.$inferSelect>> {
  const result = await ctx.db.query.device.findFirst({
    where: (device) => eq(device.deviceId, +input.device_id),
  });

  if (!result)
    return {
      error: `Device id ${input.device_id} not found`,
      status: 404,
    };

  return { data: result };
}

export const deviceRouter = createTRPCRouter({
  getDevices: publicProcedure.query(async ({ ctx }) => {
    return { data: await ctx.db.query.device.findMany() } as Result<
      (typeof device.$inferSelect)[]
    >;
  }),
  getDevice: publicProcedure
    .input(getDeviceProps)
    .query(async ({ input, ctx }) => {
      return await getDevice(input, ctx);
    }),
  getDeviceReadings: publicProcedure
    .input(getDeviceReadingsProps)
    .query(async ({ input, ctx }) => {
      const device = await getDevice(
        { device_id: input.device.device_id },
        ctx,
      );

      if (!device.data) {
        return device;
      }

      if (input.sensor_id) {
        const sensor = await getSensor({ id: input.sensor_id }, ctx);
        if (!sensor.data) {
          return sensor;
        }

        const readings = await ctx.db.query.reading.findMany({
          where: (reading) =>
            and(
              device.data ? eq(reading.deviceId, device.data.id) : undefined,
              sensor.data ? eq(reading.sensorId, sensor.data.id) : undefined,
            ),
        });

        const readingsRecord: [string, number][] = [];
        readings.map((reading) => {
          readingsRecord.push([
            `${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`,
            reading.value,
          ]);
        });

        return { data: readingsRecord } as Result<typeof readingsRecord>;
      }

      const readings = await ctx.db.query.reading.findMany({
        where: (reading) => {
          return device.data ? eq(reading.deviceId, device.data.id) : undefined;
        },
      });

      const readingsRecord: [string, number][] = [];
      readings.map((reading) => {
        readingsRecord.push([
          `${reading.createdAt.getHours()}:${reading.createdAt.getMinutes()}`,
          reading.value,
        ]);
      });

      return { data: readingsRecord } as Result<typeof readingsRecord>;
    }),
  getDeviceRecordings: publicProcedure
    .input(getDeviceRecordingsProps)
    .query(async ({ input, ctx }) => {
      const device = await getDevice(
        { device_id: input.device.device_id },
        ctx,
      );

      if (!device.data) {
        return device;
      }

      const recordings = await ctx.db.query.recording.findMany({
        where: (recording) => {
          return device.data
            ? eq(recording.deviceId, device.data.id)
            : undefined;
        },
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
