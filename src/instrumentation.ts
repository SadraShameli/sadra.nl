import * as Sentry from '@sentry/nextjs';

import { scrubQueryParameters } from '~/lib/observability/QueryParameters';
import { sentryBaseOptions } from '~/lib/observability/SentryOptions';

export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME === 'nodejs') await import('zod/compile');
    if (!process.env.SENTRY_DSN) return;

    const common = {
        beforeSend: scrubQueryParameters,
        dsn: process.env.SENTRY_DSN,
        ...sentryBaseOptions({
            nodeEnvironment: process.env.NODE_ENV,
            vercelEnvironment: process.env.VERCEL_ENV,
        }),
    };

    if (
        process.env.NEXT_RUNTIME === 'nodejs' ||
        process.env.NEXT_RUNTIME === 'edge'
    ) {
        Sentry.init(common);
    }
}

export const onRequestError = Sentry.captureRequestError;
