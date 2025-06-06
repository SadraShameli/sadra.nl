import { type Config } from 'drizzle-kit';

import { env } from '~/env';

export default {
    schema: [
        './src/server/db/schemas/main.ts',
        './src/server/db/schemas/tradingBot.ts',
    ],
    dialect: 'postgresql',
    dbCredentials: {
        url: env.DATABASE_URL,
    },
    tablesFilter: ['sadranl_*', 'tradingbot_*'],
} satisfies Config;
