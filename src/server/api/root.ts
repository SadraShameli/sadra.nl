import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import { deviceRouter } from './routers/device';
import { locationRouter } from './routers/location';
import { readingRouter } from './routers/reading';
import { recordingsRouter } from './routers/recording';
import { sensorRouter } from './routers/sensor';
import { sessionRouter } from './routers/session';

export const appRouter = createTRPCRouter({
    location: locationRouter,
    sensor: sensorRouter,
    device: deviceRouter,
    reading: readingRouter,
    recording: recordingsRouter,
    session: sessionRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
