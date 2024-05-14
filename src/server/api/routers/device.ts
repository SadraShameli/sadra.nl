import { type Device, Prisma } from '@prisma/client';
import { z } from 'zod';

import type Result from '~/server/api/result';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';

export const getDeviceProps = z.object({ device_id: z.string() });

export async function getDevice(input: z.infer<typeof getDeviceProps>): Promise<Result<Device>> {
    try {
        const device = await db.device.findUniqueOrThrow({ where: { device_id: +input.device_id } });
        return { data: device };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return { error: `Device id ${input.device_id} not found`, status: 404 };
            }
        }
        return { error: e, status: 500 };
    }
}

export const deviceRouter = createTRPCRouter({
    getDevices: publicProcedure.query(async () => {
        return { data: await db.device.findMany() } as Result<Device[]>;
    }),
    getDevice: publicProcedure.input(getDeviceProps).query(async ({ input }) => {
        return getDevice(input);
    }),
});
