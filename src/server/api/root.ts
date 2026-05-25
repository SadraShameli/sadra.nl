import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import { accountingImporterRouter } from './routers/accounting-importer';
import { contactRouter } from './routers/contact';
import { deviceRouter } from './routers/iot/device';
import { locationRouter } from './routers/iot/location';
import { readingRouter } from './routers/iot/reading';
import { recordingsRouter } from './routers/iot/recording';
import { sensorRouter } from './routers/iot/sensor';
import { sensorUnitRouter } from './routers/iot/sensor-unit';
import { liftingRouter } from './routers/lifting';
import { userRouter } from './routers/user';

export const appRouter = createTRPCRouter({
    accountingImporter: accountingImporterRouter,
    contact: contactRouter,
    device: deviceRouter,
    lifting: liftingRouter,
    location: locationRouter,
    reading: readingRouter,
    recording: recordingsRouter,
    sensor: sensorRouter,
    sensorUnit: sensorUnitRouter,
    user: userRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
