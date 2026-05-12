import { type Config } from 'drizzle-kit';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export default {
    schema: [
        './src/server/db/schemas/main.ts',
        './src/server/db/schemas/auth.ts',
    ],
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
    tablesFilter: ['sadranl_*'],
} satisfies Config;
