import { type Location, Prisma } from '@prisma/client';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';

import type Result from '../result';

export const getLocationProps = z.object({ location_id: z.string() });

export async function getLocation(input: z.infer<typeof getLocationProps>): Promise<Result<Location>> {
    try {
        const location = await db.location.findUniqueOrThrow({ where: { location_id: +input.location_id } });
        return { data: location };
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return { error: `Location id ${input.location_id} not found`, status: 404 };
            }
        }
        return { error: e, status: 500 };
    }
}

export const locationRouter = createTRPCRouter({
    getLocations: publicProcedure.query(async () => {
        return { data: await db.location.findMany() } as Result<Location[]>;
    }),
    getLocation: publicProcedure.input(z.object({ location_id: z.string() })).query(async ({ input }) => {
        return getLocation(input);
    }),
});
