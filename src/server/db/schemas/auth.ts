import { sql } from 'drizzle-orm';
import { boolean, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import type { Role } from '~/lib/auth/roles';

import { createTable } from './main';

export const user = createTable(
    'user',
    {
        banExpires: timestamp('ban_expires', { withTimezone: true }),
        banned: boolean('banned').notNull().default(false),
        banReason: text('ban_reason'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        email: text('email').notNull().unique(),
        emailVerified: boolean('email_verified').notNull().default(false),
        id: text('id').primaryKey(),
        image: text('image'),
        name: text('name').notNull(),
        role: text('role').$type<Role>().notNull().default('user'),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
    },
    (t) => [
        uniqueIndex('sadranl_user_email_lower_unique').on(
            sql`lower(${t.email})`,
        ),
    ],
);

export const session = createTable('session', {
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    id: text('id').primaryKey(),
    impersonatedBy: text('impersonated_by'),
    ipAddress: text('ip_address'),
    token: text('token').notNull().unique(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = createTable('account', {
    accessToken: text('access_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
        withTimezone: true,
    }),
    accountId: text('account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    id: text('id').primaryKey(),
    idToken: text('id_token'),
    password: text('password'),
    providerId: text('provider_id').notNull(),
    refreshToken: text('refresh_token'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
        withTimezone: true,
    }),
    scope: text('scope'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
});

export const verification = createTable('verification', {
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    value: text('value').notNull(),
});
