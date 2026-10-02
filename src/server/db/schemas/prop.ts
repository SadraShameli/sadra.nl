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
    AccountTracking,
    BankrollTransferKind,
    DashboardBalanceConvention,
    FeeKind,
    FirmEngagementReason,
    FirmEngagementStatus,
    ISO_DATE_LENGTH,
    MAX_PLAN_SERIAL_LENGTH,
    PayoutStatus,
    PersonalRules,
    ReportedPayoutBasis,
    RoundStatus,
    RuleViolationKind,
    SnapshotSource,
    StoredFirmId,
    UsdCents,
    ViolationSource,
} from '~/lib/prop-accounts';
import type { PlanOptIns } from '~/lib/prop-calculator';
import type {
    AdviceSource,
    RulebookParameters,
} from '~/lib/prop-calculator/advisor';
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
const CLOSED_ROUND_STATUS: `${RoundStatus.Closed}` = 'closed';
const ACTIVE_ENGAGEMENT_STATUS: `${FirmEngagementStatus.Active}` = 'active';
const SENT_LIVE_REASON: `${FirmEngagementReason.SentLive}` = 'sent-live';
const MODELED_TRACKING: `${AccountTracking.Modeled}` = 'modeled';
const LEDGER_ONLY_TRACKING: `${AccountTracking.LedgerOnly}` = 'ledger-only';
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

function exactlyOneFirmCheck(
    name: string,
    firmId: AnyPgColumn,
    externalFirmId: AnyPgColumn,
) {
    return check(name, sql`(${firmId} IS NULL) <> (${externalFirmId} IS NULL)`);
}

function externalFirmId() {
    return uuid('external_firm_id');
}

function firmId() {
    return varchar('firm_id', { length: ENUM_LENGTH }).$type<StoredFirmId>();
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

export const propExternalFirm = createTable(
    'prop_external_firm',
    {
        createdAt: createdAt(),
        id: uuid('id').primaryKey().defaultRandom(),
        name: varchar('name', { length: LABEL_LENGTH }).notNull(),
        notes: text('notes'),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        unique('prop_external_firm_id_user_id_uq').on(t.id, t.userId),
        uniqueIndex('prop_external_firm_user_name_idx').on(
            t.userId,
            sql`lower(${t.name})`,
        ),
        check('prop_external_firm_name_ck', sql`char_length(${t.name}) > 0`),
    ],
);

export const propRound = createTable(
    'prop_round',
    {
        budgetCents: cents('budget_cents'),
        closedOn: isoDate('closed_on'),
        createdAt: createdAt(),
        externalFirmId: externalFirmId(),
        firmId: firmId(),
        id: uuid('id').primaryKey().defaultRandom(),
        label: varchar('label', { length: LABEL_LENGTH }).notNull(),
        notes: text('notes'),
        openedOn: isoDate('opened_on').notNull(),
        status: varchar('status', { length: ENUM_LENGTH })
            .$type<RoundStatus>()
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        unique('prop_round_id_user_id_uq').on(t.id, t.userId),
        foreignKey({
            columns: [t.externalFirmId, t.userId],
            foreignColumns: [propExternalFirm.id, propExternalFirm.userId],
            name: 'prop_round_external_firm_fk',
        }).onDelete('no action'),
        uniqueIndex('prop_round_user_label_idx').on(t.userId, t.label),
        index('prop_round_external_firm_idx')
            .on(t.externalFirmId, t.userId)
            .where(sql`external_firm_id IS NOT NULL`),
        check(
            'prop_round_one_firm_ck',
            sql`${t.firmId} IS NULL OR ${t.externalFirmId} IS NULL`,
        ),
        check('prop_round_budget_positive_ck', sql`${t.budgetCents} > 0`),
        check(
            'prop_round_closed_after_open_ck',
            sql`${t.closedOn} IS NULL OR ${t.closedOn} >= ${t.openedOn}`,
        ),
        check(
            'prop_round_closed_on_iff_closed_ck',
            sql`(${t.status} = ${sql.raw(`'${CLOSED_ROUND_STATUS}'`)}) = (${t.closedOn} IS NOT NULL)`,
        ),
        accountDateCheck('prop_round_opened_on_ck', t.openedOn),
        accountDateCheck('prop_round_closed_on_ck', t.closedOn),
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
        externalFirmId: externalFirmId(),
        firmId: firmId(),
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
        planLabel: varchar('plan_label', { length: LABEL_LENGTH }),
        planRulesFingerprint: varchar('plan_rules_fingerprint', {
            length: LABEL_LENGTH,
        }),
        planSerial: varchar('plan_serial', {
            length: PLAN_SERIAL_LENGTH,
        }),
        purchasedOn: isoDate('purchased_on').notNull(),
        replacesAccountId: uuid('replaces_account_id'),
        roundId: uuid('round_id'),
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
        tracking: varchar('tracking', { length: ENUM_LENGTH })
            .default(MODELED_TRACKING)
            .$type<AccountTracking>()
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        unique('prop_account_id_user_id_uq').on(t.id, t.userId),
        foreignKey({
            columns: [t.externalFirmId, t.userId],
            foreignColumns: [propExternalFirm.id, propExternalFirm.userId],
            name: 'prop_account_external_firm_fk',
        }).onDelete('no action'),
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
        foreignKey({
            columns: [t.roundId, t.userId],
            foreignColumns: [propRound.id, propRound.userId],
            name: 'prop_account_round_fk',
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
        index('prop_account_round_idx')
            .on(t.roundId, t.userId)
            .where(sql`round_id IS NOT NULL`),
        index('prop_account_external_firm_idx')
            .on(t.externalFirmId, t.userId)
            .where(sql`external_firm_id IS NOT NULL`),
        check(
            'prop_account_tracking_shape_ck',
            sql`(${t.tracking} = ${sql.raw(`'${MODELED_TRACKING}'`)} AND ${t.firmId} IS NOT NULL AND ${t.planSerial} IS NOT NULL AND ${t.externalFirmId} IS NULL AND ${t.planLabel} IS NULL) OR (${t.tracking} = ${sql.raw(`'${LEDGER_ONLY_TRACKING}'`)} AND ${t.planSerial} IS NULL AND ${t.planLabel} IS NOT NULL AND (${t.firmId} IS NULL) <> (${t.externalFirmId} IS NULL))`,
        ),
        check(
            'prop_account_plan_label_ck',
            sql`${t.planLabel} IS NULL OR char_length(${t.planLabel}) > 0`,
        ),
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
        approvedOn: isoDate('approved_on'),
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
        check(
            'prop_payout_approved_after_request_ck',
            sql`${t.approvedOn} IS NULL OR ${t.approvedOn} >= ${t.requestedOn}`,
        ),
        check(
            'prop_payout_paid_after_approval_ck',
            sql`${t.paidOn} IS NULL OR ${t.approvedOn} IS NULL OR ${t.paidOn} >= ${t.approvedOn}`,
        ),
        accountDateCheck('prop_payout_requested_on_ck', t.requestedOn),
        accountDateCheck('prop_payout_approved_on_ck', t.approvedOn),
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
        source: varchar('source', { length: ENUM_LENGTH })
            .$type<AdviceSource>()
            .notNull(),
        stage: varchar('stage', { length: ENUM_LENGTH })
            .$type<AccountStage>()
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        unique('prop_sizing_decision_id_account_user_uq').on(
            t.id,
            t.accountId,
            t.userId,
        ),
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
            t.decidedOn.desc().nullsFirst(),
            t.createdAt.desc().nullsFirst(),
            t.id.desc().nullsFirst(),
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

export const propBankrollTransfer = createTable(
    'prop_bankroll_transfer',
    {
        amountCents: cents('amount_cents').notNull(),
        createdAt: createdAt(),
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: ENUM_LENGTH })
            .$type<BankrollTransferKind>()
            .notNull(),
        note: text('note'),
        occurredOn: isoDate('occurred_on').notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        index('prop_bankroll_transfer_user_occurred_idx').on(
            t.userId,
            t.occurredOn,
        ),
        check(
            'prop_bankroll_transfer_amount_positive_ck',
            sql`${t.amountCents} > 0`,
        ),
        accountDateCheck('prop_bankroll_transfer_occurred_on_ck', t.occurredOn),
    ],
);

export const propFirmEngagement = createTable(
    'prop_firm_engagement',
    {
        createdAt: createdAt(),
        externalFirmId: externalFirmId(),
        firmId: firmId(),
        id: uuid('id').primaryKey().defaultRandom(),
        note: text('note'),
        reason: varchar('reason', {
            length: ENUM_LENGTH,
        }).$type<FirmEngagementReason>(),
        sentLiveOn: isoDate('sent_live_on'),
        sinceOn: isoDate('since_on').notNull(),
        status: varchar('status', { length: ENUM_LENGTH })
            .$type<FirmEngagementStatus>()
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        foreignKey({
            columns: [t.externalFirmId, t.userId],
            foreignColumns: [propExternalFirm.id, propExternalFirm.userId],
            name: 'prop_firm_engagement_external_firm_fk',
        }).onDelete('no action'),
        index('prop_firm_engagement_user_since_idx').on(t.userId, t.sinceOn),
        uniqueIndex('prop_firm_engagement_user_firm_idx')
            .on(t.userId, t.firmId)
            .where(sql`firm_id IS NOT NULL`),
        uniqueIndex('prop_firm_engagement_user_external_firm_idx')
            .on(t.userId, t.externalFirmId)
            .where(sql`external_firm_id IS NOT NULL`),
        exactlyOneFirmCheck(
            'prop_firm_engagement_one_firm_ck',
            t.firmId,
            t.externalFirmId,
        ),
        check(
            'prop_firm_engagement_reason_ck',
            sql`(${t.status} = ${sql.raw(`'${ACTIVE_ENGAGEMENT_STATUS}'`)}) = (${t.reason} IS NULL)`,
        ),
        check(
            'prop_firm_engagement_sent_live_reason_ck',
            sql`(${t.reason} IS NOT DISTINCT FROM ${sql.raw(`'${SENT_LIVE_REASON}'`)}) = (${t.sentLiveOn} IS NOT NULL)`,
        ),
        check(
            'prop_firm_engagement_sent_live_before_since_ck',
            sql`${t.sentLiveOn} IS NULL OR ${t.sentLiveOn} <= ${t.sinceOn}`,
        ),
        accountDateCheck('prop_firm_engagement_since_on_ck', t.sinceOn),
        accountDateCheck('prop_firm_engagement_sent_live_on_ck', t.sentLiveOn),
    ],
);

export const propFirmStatement = createTable(
    'prop_firm_statement',
    {
        asOf: isoDate('as_of').notNull(),
        basis: varchar('basis', { length: ENUM_LENGTH })
            .$type<ReportedPayoutBasis>()
            .notNull(),
        createdAt: createdAt(),
        externalFirmId: externalFirmId(),
        firmId: firmId(),
        id: uuid('id').primaryKey().defaultRandom(),
        note: text('note'),
        reportedPayoutCents: cents('reported_payout_cents').notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        foreignKey({
            columns: [t.externalFirmId, t.userId],
            foreignColumns: [propExternalFirm.id, propExternalFirm.userId],
            name: 'prop_firm_statement_external_firm_fk',
        }).onDelete('no action'),
        index('prop_firm_statement_user_firm_as_of_idx').on(
            t.userId,
            t.firmId,
            t.asOf,
        ),
        index('prop_firm_statement_user_external_firm_as_of_idx').on(
            t.userId,
            t.externalFirmId,
            t.asOf,
        ),
        exactlyOneFirmCheck(
            'prop_firm_statement_one_firm_ck',
            t.firmId,
            t.externalFirmId,
        ),
        nonNegative(
            'prop_firm_statement_reported_payout_ck',
            t.reportedPayoutCents,
        ),
        accountDateCheck('prop_firm_statement_as_of_ck', t.asOf),
    ],
);

export const propRuleViolation = createTable(
    'prop_rule_violation',
    {
        accountId: uuid('account_id').notNull(),
        costCents: cents('cost_cents'),
        createdAt: createdAt(),
        decisionId: uuid('decision_id'),
        id: uuid('id').primaryKey().defaultRandom(),
        kind: varchar('kind', { length: ENUM_LENGTH })
            .$type<RuleViolationKind>()
            .notNull(),
        note: text('note'),
        occurredOn: isoDate('occurred_on').notNull(),
        source: varchar('source', { length: ENUM_LENGTH })
            .$type<ViolationSource>()
            .notNull(),
        updatedAt: updatedAt(),
        userId: ownerId(),
    },
    (t) => [
        foreignKey({
            columns: [t.accountId, t.userId],
            foreignColumns: [propAccount.id, propAccount.userId],
            name: 'prop_rule_violation_account_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [t.decisionId, t.accountId, t.userId],
            foreignColumns: [
                propSizingDecision.id,
                propSizingDecision.accountId,
                propSizingDecision.userId,
            ],
            name: 'prop_rule_violation_decision_fk',
        }).onDelete('no action'),
        index('prop_rule_violation_user_account_occurred_idx').on(
            t.userId,
            t.accountId,
            t.occurredOn,
        ),
        index('prop_rule_violation_user_occurred_idx').on(
            t.userId,
            t.occurredOn,
        ),
        index('prop_rule_violation_decision_idx')
            .on(t.decisionId, t.accountId, t.userId)
            .where(sql`decision_id IS NOT NULL`),
        accountDateCheck('prop_rule_violation_occurred_on_ck', t.occurredOn),
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
export type PropBankrollTransferRow = typeof propBankrollTransfer.$inferSelect;
export type PropCopyGroupRow = typeof propCopyGroup.$inferSelect;
export type PropExternalFirmRow = typeof propExternalFirm.$inferSelect;
export type PropFeeRow = typeof propFee.$inferSelect;
export type PropFirmEngagementRow = typeof propFirmEngagement.$inferSelect;
export type PropFirmStatementRow = typeof propFirmStatement.$inferSelect;
export type PropPayoutRow = typeof propPayout.$inferSelect;
export type PropRoundRow = typeof propRound.$inferSelect;
export type PropRulebookRow = typeof propRulebook.$inferSelect;
export type PropRuleViolationRow = typeof propRuleViolation.$inferSelect;
export type PropSavedScenarioRow = typeof propSavedScenario.$inferSelect;
export type PropSizingDecisionRow = typeof propSizingDecision.$inferSelect;
