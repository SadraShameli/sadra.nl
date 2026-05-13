import { format } from 'date-fns';
import { desc, eq } from 'drizzle-orm';
import { type z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { recording } from '~/server/db/schemas/main';

import { type Result } from '../types/types';
import { createRecordingProps, getRecordingProps } from '../types/zod';
import { getDevice } from './device';

export function getRecordingFileName(date: Date) {
    return `${format(date, 'MMM d, y - HH.mm')}.wav`;
}

async function getRecording(
    input: z.infer<typeof getRecordingProps>,
    ctx: ContextType,
): Promise<Result<typeof recording.$inferSelect>> {
    const res = await ctx.db.query.recording.findFirst({
        where: (recording) => eq(recording.id, input.id),
    });

    if (!res) {
        return {
            error: `Recording id ${input.id} not found`,
            status: 404,
        };
    }

    return { data: res };
}

async function getRecordingNoFile(
    input: z.infer<typeof getRecordingProps>,
    ctx: ContextType,
) {
    return await ctx.db.query.recording.findFirst({
        columns: {
            created_at: true,
            device_id: true,
            file_name: true,
            id: true,
            location_id: true,
        },
        where: (recording) => eq(recording.id, input.id),
    });
}

async function getRecordingsNoFile(ctx: ContextType) {
    return await ctx.db.query.recording.findMany({
        columns: {
            created_at: true,
            device_id: true,
            file_name: true,
            id: true,
            location_id: true,
        },
        orderBy: (recording) => desc(recording.id),
    });
}

export const recordingsRouter = createTRPCRouter({
    createRecording: publicProcedure
        .input(createRecordingProps)
        .mutation(async ({ ctx, input }) => {
            const device = await getDevice(input.device, ctx);
            if (!device.data) {
                return device;
            }

            await ctx.db.insert(recording).values({
                device_id: device.data.id,
                file: input.recording,
                file_name: getRecordingFileName(new Date()),
                location_id: device.data.location_id,
            });

            return { status: 201 };
        }),

    getRecording: publicProcedure
        .input(getRecordingProps)
        .query(async ({ ctx, input }) => {
            return await getRecording(input, ctx);
        }),

    getRecordingNoFile: publicProcedure
        .input(getRecordingProps)
        .query(async ({ ctx, input }) => {
            return await getRecordingNoFile(input, ctx);
        }),

    getRecordings: publicProcedure.query(async ({ ctx }) => {
        return (await ctx.db.query.recording.findMany({
            columns: {
                created_at: true,
                device_id: true,
                file_name: true,
                id: true,
                location_id: true,
            },
        })) as Result<(typeof recording.$inferSelect)[]>;
    }),

    getRecordingsNoFile: publicProcedure.query(async ({ ctx }) => {
        return await getRecordingsNoFile(ctx);
    }),
});
