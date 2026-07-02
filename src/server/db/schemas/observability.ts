import { integer, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

import { createTable } from './main';

export const rateLimitBucket = createTable(
    'rate_limit_bucket',
    {
        bucket: varchar('bucket', { length: 64 }).notNull(),
        count: integer('count').notNull(),
        key: varchar('key', { length: 128 }).notNull(),
        resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.bucket, t.key] })],
);
