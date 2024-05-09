import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';

export const deviceRouter = createTRPCRouter({
    getDeviceProperties: publicProcedure.input(z.object({ DeviceId: z.number() })).query(({ input }) => {
        return input.DeviceId;
    }),
});
