import { Prisma, type Recording } from '@prisma/client';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';

import { getDevice, getDeviceProps } from './device';
import type Result from '../result';

export const getRecordingProps = z.object({ id: z.string() });

export const createRecordingProps = z.object({
    device: getDeviceProps,
    recording: z.instanceof(Buffer).refine((buffer) => buffer.length, { message: 'No recording provided' }),
});

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
        return { data: await db.recording.findMany({ select: { id: true, createdAt: true, deviceId: true } }) } as Result<Recording[]>;
    }),
    getRecording: publicProcedure.input(getRecordingProps).query(async ({ input }) => {
        return getRecording(input);
    }),
    createRecording: publicProcedure.input(createRecordingProps).query(async ({ input }) => {
        const device = await getDevice(input.device);
        if (!device.data) {
            return device;
        }

        const recording = await db.recording.create({
            data: { deviceId: device.data.id, file: input.recording },
            select: {
                id: true,
                createdAt: true,
                deviceId: true,
            },
        });

        return { data: recording, status: 201 } as Result<Recording>;
    }),
});
