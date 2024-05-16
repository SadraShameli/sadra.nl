import { Prisma, type Recording } from '@prisma/client';
import { type z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';
import { getRecordingsNoFileSelect } from '~/types/db';
import { createRecordingProps, getRecordingProps } from '~/types/zod';

import { getDevice } from './device';
import type Result from '../result';

export function getRecordingFileName(date: Date) {
    return `${date.toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' })} - ${date.getHours()}.${date.getMinutes()}.wav`;
}

export async function getRecordingNoFile(input: z.infer<typeof getRecordingProps>) {
    return await db.recording.findUniqueOrThrow({ where: { id: +input.id }, select: getRecordingsNoFileSelect });
}

export async function getRecordingsNoFile() {
    return await db.recording.findMany({ select: getRecordingsNoFileSelect });
}

export async function getRecording(input: z.infer<typeof getRecordingProps>): Promise<Result<Recording>> {
    try {
        const recording = await db.recording.findUniqueOrThrow({ where: { id: +input.id } });
        return { data: recording };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return { error: `Reading id ${input.id} not found`, status: 404 };
            }
        }
        return { error: e, status: 500 };
    }
}

export const recordingsRouter = createTRPCRouter({
    getRecordings: publicProcedure.query(async () => {
        return { data: await db.recording.findMany({ select: getRecordingsNoFileSelect }) } as Result<Recording[]>;
    }),
    getRecordingsNoFile: publicProcedure.query(async () => {
        return await getRecordingsNoFile();
    }),
    getRecording: publicProcedure.input(getRecordingProps).query(async ({ input }) => {
        return await getRecording(input);
    }),
    getRecordingNoFile: publicProcedure.input(getRecordingProps).query(async ({ input }) => {
        return await getRecordingNoFile(input);
    }),
    createRecording: publicProcedure.input(createRecordingProps).mutation(async ({ input }) => {
        const device = await getDevice(input.device);
        if (!device.data) {
            return device;
        }

        const recording = await db.recording.create({
            data: { device_id: device.data.id, file: input.recording, file_name: getRecordingFileName(new Date()) },
            select: getRecordingsNoFileSelect,
        });

        return { data: recording, status: 201 } as Result<Recording>;
    }),
});
