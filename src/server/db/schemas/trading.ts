import { sql } from 'drizzle-orm';
import {
    boolean,
    integer,
    jsonb,
    real,
    text,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core';

import type {
    Answers,
    AssessmentResult,
    TradingPlanConfig,
} from '~/lib/trading-types';

import { createTable } from './main';

export const tradingPlans = createTable('trading_plan', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    isActive: boolean('is_active').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    config: jsonb('config').$type<TradingPlanConfig>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});

export const tradeAssessments = createTable('trade_assessment', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    planId: text('plan_id'),
    planSnapshot: jsonb('plan_snapshot').$type<TradingPlanConfig>().notNull(),
    answers: jsonb('answers').$type<Answers>().notNull(),
    result: jsonb('result').$type<AssessmentResult>().notNull(),
    score: real('score').notNull(),
    grade: varchar('grade', { length: 4 }).notNull(),
    recommendation: varchar('recommendation', { length: 32 }).notNull(),
    outcome: varchar('outcome', { length: 16 }),
    outcomeR: real('outcome_r'),
    outcomeNotes: text('outcome_notes'),
    outcomeRecordedAt: timestamp('outcome_recorded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});
