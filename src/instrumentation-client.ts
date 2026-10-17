import * as Sentry from '@sentry/nextjs';

import { sentryBaseOptions } from '~/lib/observability/SentryOptions';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        ...sentryBaseOptions({
            nodeEnvironment: process.env.NODE_ENV,
            vercelEnvironment: process.env.NEXT_PUBLIC_VERCEL_ENV,
        }),
    });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
