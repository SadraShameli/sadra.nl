import { createTRPCRouter } from '~/server/api/trpc';

import { notificationRouter } from './notification';
import { settingsRouter } from './settings';

export const userRouter = createTRPCRouter({
    notification: notificationRouter,
    settings: settingsRouter,
});
