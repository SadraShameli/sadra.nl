import { sql } from 'drizzle-orm';
import {
    boolean,
    primaryKey,
    text,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core';

import type { EventType } from '~/lib/notify/types';

import { user } from './auth';
import { createTable } from './main';

export const notificationPreference = createTable(
    'notification_preference',
    {
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        enabled: boolean('enabled').notNull().default(false),
        eventType: varchar('event_type', { length: 32 })
            .$type<EventType>()
            .notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (t) => [primaryKey({ columns: [t.userId, t.eventType] })],
);
