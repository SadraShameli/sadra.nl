import { Prisma, type Recording } from '@prisma/client';
import { format } from 'date-fns';
import { type z } from 'zod';

import {
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { getRecordingsNoFileSelect } from '~/types/db';
import type Result from '~/types/result';
import { createRecordingProps, getRecordingProps } from '~/types/zod';

import { getDevice } from './device';

export function getRecordingFileName(date: Date) {
    return `${format(date, 'MMM d, y - H.mm')}.wav`;
}

export async function getRecordingNoFile(
    input: z.infer<typeof getRecordingProps>,
    ctx: ContextType,
) {
    return await ctx.db.recording.findUniqueOrThrow({
        where: { id: +input.id },
        select: getRecordingsNoFileSelect,
    });
}

export async function getRecordingsNoFile(ctx: ContextType) {
    return await ctx.db.recording.findMany({
        select: getRecordingsNoFileSelect,
    });
}

export async function getRecording(
    input: z.infer<typeof getRecordingProps>,
    ctx: ContextType,
): Promise<Result<Recording>> {
    try {
        const recording = await ctx.db.recording.findUniqueOrThrow({
            where: { id: +input.id },
        });
        return { data: recording };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return {
                    error: `Recording id ${input.id} not found`,
                    status: 404,
                };
            }
        }
        return { error: e, status: 500 };
    }
}

export const recordingsRouter = createTRPCRouter({
    getRecordings: publicProcedure.query(async ({ ctx }) => {
        return {
            data: await ctx.db.recording.findMany({
                select: getRecordingsNoFileSelect,
            }),
        } as Result<Recording[]>;
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

            const recording = await ctx.db.recording.create({
                data: {
                    device_id: device.data.id,
                    location_id: device.data.location_id,
                    file: input.recording,
                    file_name: getRecordingFileName(new Date()),
                },
                select: getRecordingsNoFileSelect,
            });

            return { data: recording, status: 201 } as Result<Recording>;
        }),
});
