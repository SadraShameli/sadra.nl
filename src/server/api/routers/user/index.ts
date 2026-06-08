import { createTRPCRouter } from '~/server/api/trpc';

import { notificationRouter } from './notification';

export const userRouter = createTRPCRouter({
    notification: notificationRouter,
});
