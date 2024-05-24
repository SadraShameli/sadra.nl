import { format } from 'date-fns';
import { type z } from 'zod';

import {
  type ContextType,
  createTRPCRouter,
  publicProcedure,
} from '~/server/api/trpc';
import { type Result } from '../types/types';
import { createRecordingProps, getRecordingProps } from '../types/zod';

import { getDevice } from './device';
import { eq } from 'drizzle-orm';
import { recording } from '~/server/db/schema';

export function getRecordingFileName(date: Date) {
  return `${format(date, 'MMM d, y - HH.mm')}.wav`;
}

export async function getRecordingNoFile(
  input: z.infer<typeof getRecordingProps>,
  ctx: ContextType,
) {
  return await ctx.db.query.recording.findFirst({
    where: (recording) => eq(recording.id, +input.id),
    columns: {
      id: true,
      createdAt: true,
      locationId: true,
      deviceId: true,
      fileName: true,
    },
  });
}

export async function getRecordingsNoFile(ctx: ContextType) {
  return await ctx.db.query.recording.findMany({
    columns: {
      id: true,
      createdAt: true,
      locationId: true,
      deviceId: true,
      fileName: true,
    },
  });
}

export async function getRecording(
  input: z.infer<typeof getRecordingProps>,
  ctx: ContextType,
): Promise<Result<typeof recording.$inferSelect>> {
  const result = await ctx.db.query.recording.findFirst({
    where: (recording) => eq(recording.id, +input.id),
  });

  if (!result) {
    return {
      error: `Recording id ${input.id} not found`,
      status: 404,
    };
  }

  return { data: result };
}

export const recordingsRouter = createTRPCRouter({
  getRecordings: publicProcedure.query(async ({ ctx }) => {
    return (await ctx.db.query.recording.findMany({
      columns: {
        id: true,
        createdAt: true,
        locationId: true,
        deviceId: true,
        fileName: true,
      },
    })) as Result<(typeof recording.$inferSelect)[]>;
  }),
  getRecordingsNoFile: publicProcedure.query(async ({ ctx }) => {
    return await getRecordingsNoFile(ctx);
  }),
  getRecording: publicProcedure
    .input(getRecordingProps)
    .query(async ({ input, ctx }) => {
      return await getRecording(input, ctx);
    }),
  getRecordingNoFile: publicProcedure
    .input(getRecordingProps)
    .query(async ({ input, ctx }) => {
      return await getRecordingNoFile(input, ctx);
    }),
  createRecording: publicProcedure
    .input(createRecordingProps)
    .mutation(async ({ input, ctx }) => {
      const device = await getDevice(input.device, ctx);
      if (!device.data) {
        return device;
      }

      await ctx.db.insert(recording).values({
        locationId: device.data.locationId,
        deviceId: device.data.id,
        fileName: getRecordingFileName(new Date()),
        file: input.recording,
      });

      return { status: 201 } as Result<unknown>;
    }),
});
