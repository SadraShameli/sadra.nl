import type { BetterAuthOptions } from 'better-auth';

import { after } from 'next/server';

type BackgroundTasks = NonNullable<
    NonNullable<BetterAuthOptions['advanced']>['backgroundTasks']
>;

export const authBackgroundTasks: BackgroundTasks = {
    handler: (task) => {
        after(task);
    },
};
