import { type Config } from 'drizzle-kit';

export default {
    dbCredentials: {
        url: process.env.DATABASE_URL ?? '',
    },
    dialect: 'postgresql',
    schema: [
        './src/server/db/schemas/main.ts',
        './src/server/db/schemas/auth.ts',
        './src/server/db/schemas/trading.ts',
    ],
    tablesFilter: ['sadranl_*'],
} satisfies Config;
