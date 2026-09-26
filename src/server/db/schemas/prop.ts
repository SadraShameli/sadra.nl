import { sql } from 'drizzle-orm';
import {
    type AnyPgColumn,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';

import type {
    AccountEventDetail,
    AccountEventKind,
    AccountStage,
    AccountStatus,
    DashboardBalanceConvention,
    FeeKind,
    ISO_DATE_LENGTH,
    MAX_PLAN_SERIAL_LENGTH,
    PayoutStatus,
    PersonalRules,
    SnapshotSource,
    StoredFirmId,
    UsdCents,
} from '~/lib/prop-accounts';
import type { PlanOptIns } from '~/lib/prop-calculator';
import type { RulebookParameters } from '~/lib/prop-calculator/advisor';
import type { MAX_ACCEPTED_RUNGS } from '~/lib/schemas/propAccounts';

import { user } from './auth';
import { createTable } from './main';

type StoredJsonb<T> = T extends boolean | null | number | string | undefined
    ? T
    : T extends readonly (infer Item)[]
      ? readonly StoredJsonb<Item>[]
      : { readonly [Key in keyof T]?: StoredJsonb<T[Key]> };

const DATE_LENGTH: typeof ISO_DATE_LENGTH = 10;
const PLAN_SERIAL_LENGTH: typeof MAX_PLAN_SERIAL_LENGTH = 64;
const ENUM_LENGTH = 32;
const LABEL_LENGTH = 64;
const MAX_RUNGS: typeof MAX_ACCEPTED_RUNGS = 20;
const PAID_STATUS: `${PayoutStatus.Paid}` = 'paid';
const ACCOUNT_DATE_PATTERN =
    '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';

function accountDateCheck(name: string, column: AnyPgColumn) {
    const firstOfMonth = sql`make_date(substr(${column}, 1, 4)::integer, substr(${column}, 6, 2)::integer, 1)`;
    const dayOffset = sql`(substr(${column}, 9, 2)::integer - 1)`;
    return check(
        name,
        sql`${column} IS NULL OR CASE WHEN ${column} ~ ${sql.raw(`'${ACCOUNT_DATE_PATTERN}'`)} THEN to_char(${firstOfMonth} + ${dayOffset}, 'YYYY-MM-DD') = ${column} ELSE false END`,
    );
}

function cents(name: string) {
    return integer(name).$type<UsdCents>();
}

function createdAt() {
    return timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull();
}

function isoDate(name: string) {
    return varchar(name, { length: DATE_LENGTH });
}

function nonNegative(name: string, column: AnyPgColumn) {
    return check(name, sql`${column} >= 0`);
}

function ownerId() {
    return text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' });
}

function updatedAt() {
    return timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull();
}

export const propCopyGroup = createTable(
    'prop_copy_group',
    {
        createdAt: createdAt(),
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: LABEL_LENGTH }).notNull(),
        notes: text('notes'),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        unique('prop_copy_group_id_user_id_uq').on(t.id, t.userId),
        uniqueIndex('prop_copy_group_user_name_idx').on(t.userId, t.name),
    ],
);

export const propAccount = createTable(
    'prop_account',
    {
        accountSize: integer('account_size').notNull(),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
        copyGroupId: uuid('copy_group_id'),
        createdAt: createdAt(),
        dashboardConvention: varchar('dashboard_convention', {
            length: ENUM_LENGTH,
        })
            .$type<DashboardBalanceConvention>()
            .notNull(),
        externalAlias: varchar('external_alias', { length: LABEL_LENGTH }),
        firmId: varchar('firm_id', { length: ENUM_LENGTH })
            .$type<StoredFirmId>()
            .notNull(),
        firstFundedTradeOn: isoDate('first_funded_trade_on'),
        fundedOn: isoDate('funded_on'),
        id: uuid('id').primaryKey().defaultRandom(),
        label: varchar('label', { length: LABEL_LENGTH }).notNull(),
        liveStartBalanceCents: cents('live_start_balance_cents'),
        notes: text('notes'),
        optIns: jsonb('opt_ins')
            .$type<StoredJsonb<PlanOptIns>>()
            .default(sql`'{}'::jsonb`)
            .notNull(),
        personalRules: jsonb('personal_rules')
            .$type<StoredJsonb<PersonalRules>>()
            .default(sql`'{}'::jsonb`)
            .notNull(),
        planRulesFingerprint: varchar('plan_rules_fingerprint', {
            length: LABEL_LENGTH,
        }),
        planSerial: varchar('plan_serial', {
            length: PLAN_SERIAL_LENGTH,
        }).notNull(),
        purchasedOn: isoDate('purchased_on').notNull(),
        replacesAccountId: uuid('replaces_account_id'),
        stage: varchar('stage', { length: ENUM_LENGTH })
            .$type<AccountStage>()
            .notNull(),
        status: varchar('status', { length: ENUM_LENGTH })
            .$type<AccountStatus>()
            .notNull(),
        tags: jsonb('tags')
            .$type<string[]>()
            .default(sql`'[]'::jsonb`)
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        unique('prop_account_id_user_id_uq').on(t.id, t.userId),
        foreignKey({
            columns: [t.copyGroupId, t.userId],
            foreignColumns: [propCopyGroup.id, propCopyGroup.userId],
            name: 'prop_account_copy_group_fk',
        }).onDelete('no action'),
        foreignKey({
            columns: [t.replacesAccountId, t.userId],
            foreignColumns: [t.id, t.userId],
            name: 'prop_account_replaces_account_fk',
        }).onDelete('no action'),
        uniqueIndex('prop_account_user_label_active_idx')
            .on(t.userId, t.label)
            .where(sql`archived_at IS NULL`),
        index('prop_account_user_stage_idx').on(t.userId, t.stage),
        index('prop_account_user_firm_idx').on(t.userId, t.firmId),
        index('prop_account_copy_group_idx')
            .on(t.copyGroupId, t.userId)
            .where(sql`copy_group_id IS NOT NULL`),
        index('prop_account_replaces_account_idx')
            .on(t.replacesAccountId, t.userId)
            .where(sql`replaces_account_id IS NOT NULL`),
        nonNegative(
            'prop_account_live_start_balance_ck',
            t.liveStartBalanceCents,
        ),
        check(
            'prop_account_not_self_replacing_ck',
            sql`${t.replacesAccountId} <> ${t.id}`,
        ),
        accountDateCheck('prop_account_purchased_on_ck', t.purchasedOn),
        accountDateCheck('prop_account_funded_on_ck', t.fundedOn),
        accountDateCheck(
            'prop_account_first_funded_trade_on_ck',
            t.firstFundedTradeOn,
        ),
    ],
);

export const propAccountSnapshot = createTable(
    'prop_account_snapshot',
    {
        accountId: uuid('account_id').notNull(),
        asOf: isoDate('as_of').notNull(),
        balanceAtLastPayoutCents: cents('balance_at_last_payout_cents'),
        balanceCents: cents('balance_cents').notNull(),
        createdAt: createdAt(),
        cumulativePayoutCents: cents('cumulative_payout_cents'),
        cycleBestDayProfitCents: cents('cycle_best_day_profit_cents'),
        dashboardFloorCents: cents('dashboard_floor_cents'),
        evalBestDayProfitCents: cents('eval_best_day_profit_cents'),
        floorAtLastPayoutCents: cents('floor_at_last_payout_cents'),
        highestEodBalanceCents: cents('highest_eod_balance_cents'),
        highestIntradayBalanceCents: cents('highest_intraday_balance_cents'),
        id: uuid('id').primaryKey().defaultRandom(),
        lastPayoutOn: isoDate('last_payout_on'),
        lastTradedOn: isoDate('last_traded_on'),
        payoutsTaken: integer('payouts_taken'),
        qualifyingDaysSinceLastPayout: integer(
            'qualifying_days_since_last_payout',
        ),
        source: varchar('source', { length: ENUM_LENGTH })
            .$type<SnapshotSource>()
            .notNull(),
        tradingDays: integer('trading_days'),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        unique('prop_account_snapshot_id_account_user_uq').on(
            t.id,
            t.accountId,
            t.userId,
        ),
        foreignKey({
            columns: [t.accountId, t.userId],
            foreignColumns: [propAccount.id, propAccount.userId],
            name: 'prop_account_snapshot_account_fk',
        }).onDelete('cascade'),
        index('prop_account_snapshot_user_account_as_of_idx').on(
            t.userId,
            t.accountId,
            t.asOf.desc().nullsFirst(),
            t.createdAt.desc().nullsFirst(),
            t.id.desc().nullsFirst(),
        ),
        nonNegative(
            'prop_account_snapshot_cumulative_payout_ck',
            t.cumulativePayoutCents,
        ),
        nonNegative(
            'prop_account_snapshot_cycle_best_day_ck',
            t.cycleBestDayProfitCents,
        ),
        nonNegative(
            'prop_account_snapshot_eval_best_day_ck',
            t.evalBestDayProfitCents,
        ),
        nonNegative('prop_account_snapshot_payouts_taken_ck', t.payoutsTaken),
        nonNegative('prop_account_snapshot_trading_days_ck', t.tradingDays),
        nonNegative(
            'prop_account_snapshot_qualifying_days_ck',
            t.qualifyingDaysSinceLastPayout,
        ),
        accountDateCheck('prop_account_snapshot_as_of_ck', t.asOf),
        accountDateCheck(
            'prop_account_snapshot_last_payout_on_ck',
            t.lastPayoutOn,
        ),
        accountDateCheck(
            'prop_account_snapshot_last_traded_on_ck',
            t.lastTradedOn,
        ),
    ],
);

export const propPayout = createTable(
    'prop_payout',
    {
        accountId: uuid('account_id').notNull(),
        createdAt: createdAt(),
        grossCents: cents('gross_cents').notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        netCents: cents('net_cents'),
        note: text('note'),
        paidOn: isoDate('paid_on'),
        requestedOn: isoDate('requested_on').notNull(),
        status: varchar('status', { length: ENUM_LENGTH })
            .$type<PayoutStatus>()
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        foreignKey({
            columns: [t.accountId, t.userId],
            foreignColumns: [propAccount.id, propAccount.userId],
            name: 'prop_payout_account_fk',
        }).onDelete('cascade'),
        index('prop_payout_user_account_idx').on(t.userId, t.accountId),
        index('prop_payout_user_paid_on_idx').on(t.userId, t.paidOn),
        check('prop_payout_gross_positive_ck', sql`${t.grossCents} > 0`),
        check(
            'prop_payout_net_within_gross_ck',
            sql`${t.netCents} IS NULL OR (${t.netCents} >= 0 AND ${t.netCents} <= ${t.grossCents})`,
        ),
        check(
            'prop_payout_paid_on_iff_paid_ck',
            sql`(${t.status} = ${sql.raw(`'${PAID_STATUS}'`)}) = (${t.paidOn} IS NOT NULL)`,
        ),
        check(
            'prop_payout_paid_after_request_ck',
            sql`${t.paidOn} IS NULL OR ${t.paidOn} >= ${t.requestedOn}`,
        ),
        accountDateCheck('prop_payout_requested_on_ck', t.requestedOn),
        accountDateCheck('prop_payout_paid_on_ck', t.paidOn),
    ],
);

export const propFee = createTable(
    'prop_fee',
    {
        accountId: uuid('account_id').notNull(),
        amountCents: cents('amount_cents').notNull(),
        createdAt: createdAt(),
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: ENUM_LENGTH })
            .$type<FeeKind>()
            .notNull(),
        note: text('note'),
        paidOn: isoDate('paid_on').notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        foreignKey({
            columns: [t.accountId, t.userId],
            foreignColumns: [propAccount.id, propAccount.userId],
            name: 'prop_fee_account_fk',
        }).onDelete('cascade'),
        index('prop_fee_user_account_idx').on(t.userId, t.accountId),
        index('prop_fee_user_paid_on_idx').on(t.userId, t.paidOn),
        nonNegative('prop_fee_amount_non_negative_ck', t.amountCents),
        accountDateCheck('prop_fee_paid_on_ck', t.paidOn),
    ],
);

export const propAccountEvent = createTable(
    'prop_account_event',
    {
        accountId: uuid('account_id').notNull(),
        createdAt: createdAt(),
        detail: jsonb('detail')
            .$type<StoredJsonb<AccountEventDetail>>()
            .default(sql`'{}'::jsonb`)
            .notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: ENUM_LENGTH })
            .$type<AccountEventKind>()
            .notNull(),
        occurredOn: isoDate('occurred_on').notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        foreignKey({
            columns: [t.accountId, t.userId],
            foreignColumns: [propAccount.id, propAccount.userId],
            name: 'prop_account_event_account_fk',
        }).onDelete('cascade'),
        index('prop_account_event_user_account_occurred_idx').on(
            t.userId,
            t.accountId,
            t.occurredOn,
        ),
        index('prop_account_event_user_occurred_idx').on(
            t.userId,
            t.occurredOn,
        ),
        accountDateCheck('prop_account_event_occurred_on_ck', t.occurredOn),
    ],
);

export const propRulebook = createTable('prop_rulebook', {
    createdAt: createdAt(),
    parameters: jsonb('parameters')
        .$type<StoredJsonb<RulebookParameters>>()
        .default(sql`'{}'::jsonb`)
        .notNull(),
    updatedAt: updatedAt(),
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
});

export const propSizingDecision = createTable(
    'prop_sizing_decision',
    {
        acceptedRiskCents: cents('accepted_risk_cents').notNull(),
        acceptedRungsCents: integer('accepted_rungs_cents')
            .array()
            .$type<UsdCents[]>()
            .default(sql`'{}'::integer[]`)
            .notNull(),
        accountId: uuid('account_id').notNull(),
        actualRiskCents: cents('actual_risk_cents'),
        createdAt: createdAt(),
        decidedOn: isoDate('decided_on').notNull(),
        headlineRiskCents: cents('headline_risk_cents').notNull(),
        id: uuid('id').primaryKey().defaultRandom(),
        note: text('note'),
        snapshotId: uuid('snapshot_id'),
        source: varchar('source', { length: ENUM_LENGTH }).notNull(),
        stage: varchar('stage', { length: ENUM_LENGTH })
            .$type<AccountStage>()
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        foreignKey({
            columns: [t.accountId, t.userId],
            foreignColumns: [propAccount.id, propAccount.userId],
            name: 'prop_sizing_decision_account_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [t.snapshotId, t.accountId, t.userId],
            foreignColumns: [
                propAccountSnapshot.id,
                propAccountSnapshot.accountId,
                propAccountSnapshot.userId,
            ],
            name: 'prop_sizing_decision_snapshot_fk',
        }).onDelete('no action'),
        index('prop_sizing_decision_snapshot_idx')
            .on(t.snapshotId, t.accountId, t.userId)
            .where(sql`snapshot_id IS NOT NULL`),
        index('prop_sizing_decision_user_account_decided_idx').on(
            t.userId,
            t.accountId,
            t.decidedOn,
        ),
        nonNegative(
            'prop_sizing_decision_accepted_risk_ck',
            t.acceptedRiskCents,
        ),
        nonNegative(
            'prop_sizing_decision_headline_risk_ck',
            t.headlineRiskCents,
        ),
        nonNegative('prop_sizing_decision_actual_risk_ck', t.actualRiskCents),
        check(
            'prop_sizing_decision_rungs_positive_ck',
            sql`0 < ALL(${t.acceptedRungsCents})`,
        ),
        check(
            'prop_sizing_decision_rungs_no_null_ck',
            sql`array_position(${t.acceptedRungsCents}, NULL) IS NULL`,
        ),
        check(
            'prop_sizing_decision_rungs_count_ck',
            sql`cardinality(${t.acceptedRungsCents}) <= ${sql.raw(String(MAX_RUNGS))}`,
        ),
        check(
            'prop_sizing_decision_rungs_one_dimension_ck',
            sql`COALESCE(array_ndims(${t.acceptedRungsCents}), 1) = 1`,
        ),
        accountDateCheck('prop_sizing_decision_decided_on_ck', t.decidedOn),
    ],
);

export const propSavedScenario = createTable(
    'prop_saved_scenario',
    {
        createdAt: createdAt(),
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: LABEL_LENGTH }).notNull(),
        query: text('query').notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        uniqueIndex('prop_saved_scenario_user_name_idx').on(t.userId, t.name),
    ],
);

export type PropAccountEventRow = typeof propAccountEvent.$inferSelect;
export type PropAccountRow = typeof propAccount.$inferSelect;
export type PropAccountSnapshotRow = typeof propAccountSnapshot.$inferSelect;
export type PropCopyGroupRow = typeof propCopyGroup.$inferSelect;
export type PropFeeRow = typeof propFee.$inferSelect;
export type PropPayoutRow = typeof propPayout.$inferSelect;
export type PropRulebookRow = typeof propRulebook.$inferSelect;
export type PropSavedScenarioRow = typeof propSavedScenario.$inferSelect;
export type PropSizingDecisionRow = typeof propSizingDecision.$inferSelect;
