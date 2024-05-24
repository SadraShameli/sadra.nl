import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import { locationRouter } from './routers/location';
import { sensorRouter } from './routers/sensor';
import { deviceRouter } from './routers/device';
import { readingRouter } from './routers/reading';
import { recordingsRouter } from './routers/recording';

export const appRouter = createTRPCRouter({
  location: locationRouter,
  sensor: sensorRouter,
  device: deviceRouter,
  reading: readingRouter,
  recording: recordingsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
