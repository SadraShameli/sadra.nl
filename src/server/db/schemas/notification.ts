import { sql } from 'drizzle-orm';
import {
    boolean,
    primaryKey,
    text,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { createTable } from './main';

export const notificationPreference = createTable(
    'notification_preference',
    {
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        enabled: boolean('enabled').notNull().default(false),
        eventType: varchar('event_type', { length: 32 }).notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
    },
    (t) => [primaryKey({ columns: [t.userId, t.eventType] })],
);
