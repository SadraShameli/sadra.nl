import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        NODE_ENV: z
            .enum(['development', 'test', 'production'])
            .default('development'),
        DATABASE_URL: z.url(),
        AUTH_SECRET: z.string().min(32),
        LETTERMINT_PROJECT_TOKEN: z.string().min(1),
        RESEND_API_KEY: z.string().min(1),
    },

    client: {
        NEXT_PUBLIC_SERVER_URL: z.url(),
    },

    runtimeEnv: {
        NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
        LETTERMINT_PROJECT_TOKEN: process.env.LETTERMINT_PROJECT_TOKEN,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
