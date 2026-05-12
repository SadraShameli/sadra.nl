import { sql } from 'drizzle-orm';
import { text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { createTable } from './main';

export const users = createTable('user', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 256 }),
    email: varchar('email', { length: 256 }).notNull().unique(),
    password: varchar('password', { length: 256 }),
    image: varchar('image', { length: 256 }),
    emailVerified: timestamp('email_verified', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});
