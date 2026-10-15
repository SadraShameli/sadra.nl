import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
    if (!process.env.SENTRY_DSN) return;

    const common = {
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    };

    if (
        process.env.NEXT_RUNTIME === 'nodejs' ||
        process.env.NEXT_RUNTIME === 'edge'
    ) {
        Sentry.init(common);
    }
}

export const onRequestError = Sentry.captureRequestError;
