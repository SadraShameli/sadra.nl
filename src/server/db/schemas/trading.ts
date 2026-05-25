import { sql } from 'drizzle-orm';
import {
    boolean,
    index,
    integer,
    jsonb,
    real,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type {
    Answers,
    AssessmentResult,
    ExecutionDeviation,
    Grade,
    Outcome,
    PrepChecks,
    Recommendation,
    TradingPlanConfig,
} from '~/lib/trading/types';

import { createTable } from './main';

export const tradingPlans = createTable(
    'trading_plan',
    {
        config: jsonb('config').$type<TradingPlanConfig>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        isActive: boolean('is_active').notNull().default(false),
        name: varchar('name', { length: 128 }).notNull(),
        sortOrder: integer('sort_order').notNull().default(0),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id').notNull(),
    },
    (t) => [index('trading_plan_user_sort_idx').on(t.userId, t.sortOrder)],
);

export const tradeAssessments = createTable(
    'trade_assessment',
    {
        actualRiskTaken: real('actual_risk_taken'),
        answers: jsonb('answers').$type<Answers>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        executionDeviations: jsonb('execution_deviations').$type<
            ExecutionDeviation[]
        >(),
        followedPlan: boolean('followed_plan'),
        grade: varchar('grade', { length: 4 }).$type<Grade>().notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        outcome: varchar('outcome', { length: 16 }).$type<Outcome>(),
        outcomeNotes: text('outcome_notes'),
        outcomeR: real('outcome_r'),
        outcomeRecordedAt: timestamp('outcome_recorded_at', {
            withTimezone: true,
        }),
        planId: text('plan_id'),
        planSnapshot: jsonb('plan_snapshot')
            .$type<TradingPlanConfig>()
            .notNull(),
        recommendation: varchar('recommendation', { length: 32 })
            .$type<Recommendation>()
            .notNull(),
        result: jsonb('result').$type<AssessmentResult>().notNull(),
        score: real('score').notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        index('trade_assessment_user_created_idx').on(
            table.userId,
            table.createdAt.desc(),
        ),
    ],
);

export const dailyPreparations = createTable(
    'daily_preparation',
    {
        checks: jsonb('checks').$type<PrepChecks>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        date: varchar('date', { length: 10 }).notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        notes: text('notes'),
        planId: text('plan_id'),
        score: real('score').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        uniqueIndex('daily_prep_user_date_idx').on(table.userId, table.date),
        index('daily_prep_user_created_idx').on(table.userId, table.createdAt),
    ],
);
