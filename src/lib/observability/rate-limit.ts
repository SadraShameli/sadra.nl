import 'server-only';
import { and, eq, sql } from 'drizzle-orm';

import { db, rateLimitBucket } from '~/server/db';

export async function isWithinRateLimit(arguments_: {
    bucket: string;
    key: string;
    max: number;
    windowMs: number;
}): Promise<boolean> {
    const key = arguments_.key.toLowerCase();
    const now = new Date();
    const expiredWindow = sql`${rateLimitBucket.resetAt} <= ${now}`;

    const [row] = await db
        .insert(rateLimitBucket)
        .values({
            bucket: arguments_.bucket,
            count: 1,
            key,
            resetAt: new Date(now.getTime() + arguments_.windowMs),
        })
        .onConflictDoUpdate({
            set: {
                count: sql`case when ${expiredWindow} then 1 else least(${rateLimitBucket.count} + 1, ${arguments_.max + 1}) end`,
                resetAt: sql`case when ${expiredWindow} then excluded.reset_at else ${rateLimitBucket.resetAt} end`,
            },
            target: [rateLimitBucket.bucket, rateLimitBucket.key],
        })
        .returning({ count: rateLimitBucket.count });

    return row !== undefined && row.count <= arguments_.max;
}

export async function resetRateLimit(arguments_: {
    bucket: string;
    key: string;
}): Promise<void> {
    const key = arguments_.key.toLowerCase();

    await db
        .delete(rateLimitBucket)
        .where(
            and(
                eq(rateLimitBucket.bucket, arguments_.bucket),
                eq(rateLimitBucket.key, key),
            ),
        );
}
