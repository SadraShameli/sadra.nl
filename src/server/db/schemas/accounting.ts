import { sql } from 'drizzle-orm';
import {
    index,
    jsonb,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type { CredentialKind } from '~/lib/accounting/credentials/registry';

import { user } from './auth';
import { createTable } from './main';

export const accountingCredential = createTable(
    'accounting_importer_credential',
    {
        ciphertext: text('ciphertext').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: 32 }).$type<CredentialKind>().notNull(),
        label: varchar('label', { length: 64 }).notNull(),
        lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
        meta: jsonb('meta')
            .$type<Record<string, unknown>>()
            .default({})
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (t) => [
        uniqueIndex('accounting_importer_credential_user_kind_label_idx').on(
            t.userId,
            t.kind,
            t.label,
        ),
        index('accounting_importer_credential_last_used_at_idx').on(
            t.lastUsedAt,
        ),
    ],
);
