import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        NODE_ENV: z.enum(['development', 'test', 'production']),
        DB_URL: z.string().url(),
        DB_URL_NON_POOLING: z.string().url(),
    },

    client: {},

    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        DB_URL: process.env.DB_URL,
        DB_URL_NON_POOLING: process.env.DB_URL_NON_POOLING,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
