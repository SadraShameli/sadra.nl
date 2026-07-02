import { sql } from 'drizzle-orm';
import {
    boolean,
    doublePrecision,
    index,
    integer,
    jsonb,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type { MatchType } from '~/lib/accounting/core/rules/matcher';
import type {
    Booking,
    BookingDirection,
    CurrencyCode,
} from '~/lib/accounting/core/types';
import type { CredentialKind } from '~/lib/accounting/credentials/registry';
import type {
    RunOutcome,
    RunStatus,
    RunSummary,
} from '~/lib/accounting/runs/types';

import { user } from './auth';
import { createTable } from './main';

export const accountingCredential = createTable(
    'accounting_importer_credential',
    {
        ciphertext: text('ciphertext'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        isActive: boolean('is_active').default(false).notNull(),
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
        currency: varchar('currency', { length: 8 }).$type<CurrencyCode>(),
        dateFrom: varchar('date_from', { length: 10 }),
        dateTo: varchar('date_to', { length: 10 }),
        direction: varchar('direction', { length: 3 })
            .$type<BookingDirection>()
            .notNull(),
        display: varchar('display', { length: 128 }).notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        ledgerId: integer('ledger_id').notNull(),
        ledgerLabel: varchar('ledger_label', { length: 128 }).notNull(),
        match: varchar('match', { length: 256 }).notNull(),
        matchType: varchar('match_type', { length: 16 })
            .$type<MatchType>()
            .default('contains')
            .notNull(),
        maxAmount: doublePrecision('max_amount'),
        minAmount: doublePrecision('min_amount'),
        sortOrder: integer('sort_order').default(0).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        vatCode: varchar('vat_code', { length: 16 }).$type<string>().notNull(),
    },
    (t) => [
        uniqueIndex(
            'accounting_importer_rule_user_credential_direction_match_idx',
        ).on(t.userId, t.credentialId, t.direction, t.match),
        index('accounting_importer_rule_sort_order_idx').on(
            t.credentialId,
            t.sortOrder,
        ),
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
        currency: varchar('currency', { length: 8 })
            .$type<CurrencyCode>()
            .notNull(),
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

export const accountingRun = createTable(
    'accounting_importer_run',
    {
        accountingCredentialId: uuid('accounting_credential_id').references(
            () => accountingCredential.id,
            { onDelete: 'set null' },
        ),
        apiCredentialIds: jsonb('api_credential_ids')
            .$type<string[]>()
            .default([])
            .notNull(),
        bookings: jsonb('bookings').$type<Booking[]>().default([]).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        errorMessage: text('error_message'),
        id: uuid('id').primaryKey().defaultRandom(),
        outcomes: jsonb('outcomes')
            .$type<Record<string, RunOutcome>>()
            .default({})
            .notNull(),
        startDate: varchar('start_date', { length: 10 }).notNull(),
        status: varchar('status', { length: 16 }).$type<RunStatus>().notNull(),
        summary: jsonb('summary').$type<RunSummary>().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (t) => [
        index('accounting_importer_run_user_created_at_idx').on(
            t.userId,
            t.createdAt,
        ),
    ],
);
