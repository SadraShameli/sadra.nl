import 'server-only';
import { and, eq } from 'drizzle-orm';

import { db, rateLimitBucket } from '~/server/db';

import { evaluateRateLimit } from './rate-limit-policy';

export async function checkRateLimit(arguments_: {
    bucket: string;
    key: string;
    max: number;
    windowMs: number;
}): Promise<boolean> {
    const key = arguments_.key.toLowerCase();
    const now = new Date();

    return db.transaction(async (tx) => {
        const [existing] = await tx
            .select()
            .from(rateLimitBucket)
            .where(
                and(
                    eq(rateLimitBucket.bucket, arguments_.bucket),
                    eq(rateLimitBucket.key, key),
                ),
            )
            .limit(1);

        const { allowed, next } = evaluateRateLimit(
            existing ?? null,
            now,
            arguments_.max,
            arguments_.windowMs,
        );

        await tx
            .insert(rateLimitBucket)
            .values({
                bucket: arguments_.bucket,
                count: next.count,
                key,
                resetAt: next.resetAt,
            })
            .onConflictDoUpdate({
                set: { count: next.count, resetAt: next.resetAt },
                target: [rateLimitBucket.bucket, rateLimitBucket.key],
            });

        return allowed;
    });
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
