import { sql } from 'drizzle-orm';
import { connection, NextResponse } from 'next/server';

import { db } from '~/server/db';

export async function GET() {
    await connection();
    const startedAt = Date.now();
    try {
        await db.execute(sql`select 1`);
        return NextResponse.json(
            {
                checks: { db: 'ok' },
                latencyMs: Date.now() - startedAt,
                status: 'ok',
                timestamp: new Date().toISOString(),
            },
            { status: 200 },
        );
    } catch (error) {
        return NextResponse.json(
            {
                checks: {
                    db: error instanceof Error ? error.message : 'fail',
                },
                latencyMs: Date.now() - startedAt,
                status: 'degraded',
                timestamp: new Date().toISOString(),
            },
            { status: 503 },
        );
    }
}
