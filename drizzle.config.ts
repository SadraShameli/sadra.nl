import { type Config } from 'drizzle-kit';

import { env } from '~/env';

export default {
    schema: ['./src/server/db/schemas/main.ts'],
    dialect: 'postgresql',
    dbCredentials: {
        url: env.DATABASE_URL,
    },
    tablesFilter: ['sadranl_*'],
} satisfies Config;
