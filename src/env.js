import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        NODE_ENV: z
            .enum(['development', 'test', 'production'])
            .default('development'),
        DATABASE_URL: z.string().url(),
        AUTH_SECRET: z.string().min(32),
    },

    client: {},

    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
