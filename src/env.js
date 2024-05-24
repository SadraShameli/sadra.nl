import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    server: {
        NODE_ENV: z
            .enum(['development', 'test', 'production'])
            .default('development'),
        POSTGRES_PRISMA_URL: z.string().url(),
        POSTGRES_URL_NON_POOLING: z.string().url(),
    },

    client: {},

    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
        POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
