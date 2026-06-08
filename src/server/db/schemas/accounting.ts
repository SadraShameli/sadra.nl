import { sql } from 'drizzle-orm';
import {
    index,
    integer,
    jsonb,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type { BookingDirection, VatCode } from '~/lib/accounting/core/types';
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

export const accountingRule = createTable(
    'accounting_importer_rule',
    {
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        credentialId: uuid('credential_id')
            .notNull()
            .references(() => accountingCredential.id, { onDelete: 'cascade' }),
        direction: varchar('direction', { length: 3 })
            .$type<BookingDirection>()
            .notNull(),
        display: varchar('display', { length: 128 }).notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        ledgerId: integer('ledger_id').notNull(),
        ledgerLabel: varchar('ledger_label', { length: 128 }).notNull(),
        match: varchar('match', { length: 256 }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        vatCode: varchar('vat_code', { length: 16 }).$type<VatCode>().notNull(),
    },
    (t) => [
        uniqueIndex(
            'accounting_importer_rule_user_credential_direction_match_idx',
        ).on(t.userId, t.credentialId, t.direction, t.match),
    ],
);

export const accountingBankAccount = createTable(
    'accounting_importer_bank_account',
    {
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        credentialId: uuid('credential_id')
            .notNull()
            .references(() => accountingCredential.id, { onDelete: 'cascade' }),
        currency: varchar('currency', { length: 8 }).notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        ledgerId: integer('ledger_id').notNull(),
        ledgerLabel: varchar('ledger_label', { length: 128 }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (t) => [
        uniqueIndex(
            'accounting_importer_bank_account_user_credential_currency_idx',
        ).on(t.userId, t.credentialId, t.currency),
    ],
);
