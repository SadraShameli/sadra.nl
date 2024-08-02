import { format } from 'date-fns';
import { desc, eq } from 'drizzle-orm';
import { type z } from 'zod';

import { type ContextType, createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { recording } from '~/server/db/schema';

import { getDevice } from './device';
import { type Result } from '../types/types';
import { createRecordingProps, getRecordingProps } from '../types/zod';

export function getRecordingFileName(date: Date) {
    return `${format(date, 'MMM d, y - HH.mm')}.wav`;
}

export async function getRecordingNoFile(input: z.infer<typeof getRecordingProps>, ctx: ContextType) {
    return await ctx.db.query.recording.findFirst({
        where: (recording) => eq(recording.id, +input.id),
        columns: {
            id: true,
            created_at: true,
            location_id: true,
            device_id: true,
            file_name: true,
        },
    });
}

export async function getRecordingsNoFile(ctx: ContextType) {
    return await ctx.db.query.recording.findMany({
        columns: {
            id: true,
            created_at: true,
            location_id: true,
            device_id: true,
            file_name: true,
        },
        orderBy: (recording) => desc(recording.id),
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
                created_at: true,
                location_id: true,
                device_id: true,
                file_name: true,
            },
        })) as Result<(typeof recording.$inferSelect)[]>;
    }),
    getRecordingsNoFile: publicProcedure.query(async ({ ctx }) => {
        return await getRecordingsNoFile(ctx);
    }),
    getRecording: publicProcedure.input(getRecordingProps).query(async ({ input, ctx }) => {
        return await getRecording(input, ctx);
    }),
    getRecordingNoFile: publicProcedure.input(getRecordingProps).query(async ({ input, ctx }) => {
        return await getRecordingNoFile(input, ctx);
    }),
    createRecording: publicProcedure.input(createRecordingProps).mutation(async ({ input, ctx }) => {
        const device = await getDevice(input.device, ctx);
        if (!device.data) {
            return device;
        }

        await ctx.db.insert(recording).values({
            location_id: device.data.location_id,
            device_id: device.data.id,
            file_name: getRecordingFileName(new Date()),
            file: input.recording,
        });

        return { status: 201 } as Result<unknown>;
    }),
});
