import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import { deviceRouter } from './routers/device';
import { locationRouter } from './routers/location';
import { notificationRouter } from './routers/notification';
import { readingRouter } from './routers/reading';
import { recordingsRouter } from './routers/recording';
import { sensorRouter } from './routers/sensor';
import { sessionRouter } from './routers/session';
import { userRouter } from './routers/user';

export const appRouter = createTRPCRouter({
    device: deviceRouter,
    location: locationRouter,
    notification: notificationRouter,
    reading: readingRouter,
    recording: recordingsRouter,
    sensor: sensorRouter,
    session: sessionRouter,
    user: userRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
