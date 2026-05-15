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
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        email: varchar('email', { length: 256 }),
        emailVerified: timestamp('email_verified', { withTimezone: true }),
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        image: varchar('image', { length: 256 }),
        name: varchar('name', { length: 256 }),
        password: varchar('password', { length: 256 }),
        role: varchar('role', { length: 16 }).notNull().default('user'),
    },
    (t) => [
        uniqueIndex('sadranl_user_email_lower_unique').on(
            sql`lower(${t.email})`,
        ),
    ],
);

export const passwordResetTokens = createTable('password_reset_token', {
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = createTable(
    'account',
    {
        access_token: text('access_token'),
        expires_at: integer('expires_at'),
        id_token: text('id_token'),
        provider: text('provider').notNull(),
        providerAccountId: text('provider_account_id').notNull(),
        refresh_token: text('refresh_token'),
        scope: text('scope'),
        session_state: text('session_state'),
        token_type: text('token_type'),
        type: text('type').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
    },
    (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = createTable('session', {
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    sessionToken: text('session_token').primaryKey(),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
});

export const verificationTokens = createTable(
    'verification_token',
    {
        expires: timestamp('expires', { withTimezone: true }).notNull(),
        identifier: text('identifier').notNull(),
        token: text('token').notNull(),
    },
    (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
