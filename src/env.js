import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    client: {
        NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
        NEXT_PUBLIC_SERVER_URL: z.url(),
    },

    emptyStringAsUndefined: true,

    runtimeEnv: {
        AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
        AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
        AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
        AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
        AUTH_SECRET: process.env.AUTH_SECRET,
        DATABASE_URL: process.env.DATABASE_URL,
        LETTERMINT_PROJECT_TOKEN: process.env.LETTERMINT_PROJECT_TOKEN,
        LOG_LEVEL: process.env.LOG_LEVEL,
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
        NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
        NODE_ENV: process.env.NODE_ENV,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
        SENTRY_DSN: process.env.SENTRY_DSN,
        SENTRY_ORG: process.env.SENTRY_ORG,
        SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    },

    server: {
        AUTH_GITHUB_ID: z.string().min(1).optional(),
        AUTH_GITHUB_SECRET: z.string().min(1).optional(),
        AUTH_GOOGLE_ID: z.string().min(1).optional(),
        AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
        AUTH_SECRET: z.string().min(32),
        DATABASE_URL: z.url(),
        LETTERMINT_PROJECT_TOKEN: z.string().min(1),
        LOG_LEVEL: z
            .enum(['debug', 'error', 'fatal', 'info', 'trace', 'warn'])
            .optional(),
        NODE_ENV: z
            .enum(['development', 'test', 'production'])
            .default('development'),
        RESEND_API_KEY: z.string().min(1),
        SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
        SENTRY_DSN: z.url().optional(),
        SENTRY_ORG: z.string().min(1).optional(),
        SENTRY_PROJECT: z.string().min(1).optional(),
    },
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
