import { type Config } from 'drizzle-kit';

export default {
    dbCredentials: {
        url: process.env.DATABASE_URL ?? '',
    },
    dialect: 'postgresql',
    schema: './src/server/db/schemas/*.ts',
    tablesFilter: ['sadranl_*'],
} satisfies Config;
