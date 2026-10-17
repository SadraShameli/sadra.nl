import pg from 'pg';

import { databaseConnectionString, databaseTls } from './DatabaseConnection';

const REQUIRED_EXTENSIONS = ['pg_trgm'] as const;

function readDatabaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error(
            'DATABASE_URL is required to bootstrap database extensions',
        );
    }
    return url;
}

const databaseUrl = readDatabaseUrl();
const client = new pg.Client({
    connectionString: databaseConnectionString(databaseUrl),
    ssl: databaseTls(databaseUrl),
});

await client.connect();
try {
    for (const extension of REQUIRED_EXTENSIONS) {
        const started = performance.now();
        await client.query(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
        const durationMs = performance.now() - started;
        console.log(`✓ extension ${extension} (${durationMs.toFixed(0)} ms)`);
    }
} finally {
    await client.end();
}
