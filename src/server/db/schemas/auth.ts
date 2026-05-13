import { sql } from 'drizzle-orm';
import {
    integer,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core';

import { createTable } from './main';

export const users = createTable(
    'user',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        name: varchar('name', { length: 256 }),
        email: varchar('email', { length: 256 }),
        password: varchar('password', { length: 256 }),
        image: varchar('image', { length: 256 }),
        emailVerified: timestamp('email_verified', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
    },
    (t) => [
        uniqueIndex('sadranl_user_email_lower_unique').on(
            sql`lower(${t.email})`,
        ),
    ],
);

export const passwordResetTokens = createTable('password_reset_token', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});

export const accounts = createTable(
    'account',
    {
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        type: text('type').notNull(),
        provider: text('provider').notNull(),
        providerAccountId: text('provider_account_id').notNull(),
        refresh_token: text('refresh_token'),
        access_token: text('access_token'),
        expires_at: integer('expires_at'),
        token_type: text('token_type'),
        scope: text('scope'),
        id_token: text('id_token'),
        session_state: text('session_state'),
    },
    (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = createTable('session', {
    sessionToken: text('session_token').primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});

export const verificationTokens = createTable(
    'verification_token',
    {
        identifier: text('identifier').notNull(),
        token: text('token').notNull(),
        expires: timestamp('expires', { withTimezone: true }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
