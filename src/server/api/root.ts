import { deviceRouter } from '~/server/api/routers/device';
import { registerDataRouter } from '~/server/api/routers/registerData';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

export const appRouter = createTRPCRouter({
    deviceProperties: deviceRouter,
    registerData: registerDataRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
