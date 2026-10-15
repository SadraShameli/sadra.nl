import { createTRPCRouter } from '~/server/api/trpc';

import { notificationRouter } from './notification';
import { themeRouter } from './theme';

export const userRouter = createTRPCRouter({
    notification: notificationRouter,
    theme: themeRouter,
});
