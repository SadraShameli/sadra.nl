import pg from 'pg';

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

function shouldUseSsl(raw: string): boolean {
    try {
        const url = new URL(raw);
        const sslmode = url.searchParams.get('sslmode');
        if (sslmode === 'disable') return false;
        if (
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname === '::1'
        ) {
            return false;
        }
        return true;
    } catch {
        return true;
    }
}

const databaseUrl = readDatabaseUrl();
const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
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
