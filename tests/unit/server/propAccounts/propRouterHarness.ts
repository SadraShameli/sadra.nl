import {
    getErrorShape,
    getTRPCErrorFromUnknown,
} from '@trpc/server/unstable-core-do-not-import';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    FeeKind,
    type LifecycleRejection,
    PayoutStatus,
    SnapshotSource,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { type PropMutationRejection } from '~/lib/schemas/propAccountOutputs';
import { propAccountsRouter } from '~/server/api/routers/propAccounts';
import { createCallerFactory } from '~/server/api/trpc';

import {
    createFakeDatabase,
    type FakeDatabaseError,
    type FakeRow,
    type IssuedQuery,
    readTable,
    writeTable,
} from '../fakeDatabase';
import './resetModulesAfterFile';
import {
    bankrollTransferRow,
    externalFirmRow,
    firmEngagementRow,
    firmStatementRow,
    roundRow,
    VIDEO_TABLES,
    violationRow,
} from './videoRecordFixtures';

export interface RegistryEntry {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

export type Responder = (query: IssuedQuery) => FakeRow[];

export interface RouterWithConfig {
    readonly _def: {
        readonly _config: (typeof propAccountsRouter)['_def']['_config'];
    };
}

export type Session = null | {
    user: { email: string; id: string; role: string };
};

export const USER_ID = 'user-owner';

export const SIGNED_IN: Session = {
    user: { email: 'owner@example.com', id: USER_ID, role: 'user' },
};

export const ANONYMOUS: Session = null;

export const IDS = {
    account: '11111111-1111-4111-8111-111111111111',
    copyGroup: '22222222-2222-4222-8222-222222222222',
    decision: '33333333-3333-4333-8333-333333333333',
    event: '44444444-4444-4444-8444-444444444444',
    fee: '55555555-5555-4555-8555-555555555555',
    otherAccount: '66666666-6666-4666-8666-666666666666',
    payout: '77777777-7777-4777-8777-777777777777',
    scenario: '88888888-8888-4888-8888-888888888888',
    snapshot: '99999999-9999-4999-8999-999999999999',
} as const;

export const TABLES = {
    account: 'sadranl_prop_account',
    copyGroup: 'sadranl_prop_copy_group',
    decision: 'sadranl_prop_sizing_decision',
    event: 'sadranl_prop_account_event',
    fee: 'sadranl_prop_fee',
    payout: 'sadranl_prop_payout',
    rulebook: 'sadranl_prop_rulebook',
    scenario: 'sadranl_prop_saved_scenario',
    snapshot: 'sadranl_prop_account_snapshot',
} as const;

const CREATED_AT = new Date('2026-09-01T00:00:00Z');

function registryEntry(isMatch: (plan: Plan) => boolean): RegistryEntry {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isMatch);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no registry plan matches');
}

const EVAL_ENTRY = registryEntry(
    (plan) => !plan.isInstantFunded && plan.fundedReset === null,
);
export const INSTANT_ENTRY = registryEntry((plan) => plan.isInstantFunded);

export function accountCreateInput(overrides: Record<string, unknown> = {}) {
    return {
        ...planKeyFields(EVAL_ENTRY),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        label: 'Eval one',
        purchasedOn: '2026-09-01',
        stage: AccountStage.Eval,
        ...overrides,
    };
}

export function accountRow(overrides: FakeRow = {}): FakeRow {
    const key = planKeyFields(EVAL_ENTRY);
    return {
        account_size: key.accountSize,
        archived_at: null,
        copy_group_id: null,
        created_at: CREATED_AT,
        dashboard_convention: DashboardBalanceConvention.Nominal,
        external_alias: null,
        external_firm_id: null,
        firm_id: key.firmId,
        first_funded_trade_on: null,
        funded_on: null,
        id: IDS.account,
        label: 'Eval one',
        live_start_balance_cents: null,
        notes: null,
        opt_ins: {},
        personal_rules: {},
        plan_label: null,
        plan_rules_fingerprint: null,
        plan_serial: key.planSerial,
        purchased_on: '2026-09-01',
        replaces_account_id: null,
        round_id: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function accountUpdateInput(overrides: Record<string, unknown> = {}) {
    return {
        ...planKeyFields(EVAL_ENTRY),
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: IDS.account,
        label: 'Eval one',
        liveStartBalanceCents: null,
        notes: null,
        personalRules: {},
        purchasedOn: '2026-09-01',
        replacesAccountId: null,
        tags: [],
        ...overrides,
    };
}

export function copyGroupRow(overrides: FakeRow = {}): FakeRow {
    return {
        created_at: CREATED_AT,
        id: IDS.copyGroup,
        name: 'Group one',
        notes: null,
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function decisionRow(overrides: FakeRow = {}): FakeRow {
    return {
        accepted_risk_cents: 40_000,
        accepted_rungs_cents: [40_000, 60_000],
        account_id: IDS.account,
        actual_risk_cents: null,
        created_at: CREATED_AT,
        decided_on: '2026-09-20',
        headline_risk_cents: 40_000,
        id: IDS.decision,
        note: null,
        snapshot_id: IDS.snapshot,
        source: 'documented',
        stage: AccountStage.Eval,
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function eventRow(overrides: FakeRow = {}): FakeRow {
    return {
        account_id: IDS.account,
        created_at: CREATED_AT,
        detail: { changes: [], note: null },
        id: IDS.event,
        kind: AccountEventKind.Purchased,
        occurred_on: '2026-09-01',
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function feeRow(overrides: FakeRow = {}): FakeRow {
    return {
        account_id: IDS.account,
        amount_cents: 16_500,
        created_at: CREATED_AT,
        id: IDS.fee,
        kind: FeeKind.EvalPurchase,
        note: null,
        paid_on: '2026-09-01',
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function ledgerOnlyAccountRow(overrides: FakeRow = {}): FakeRow {
    return accountRow({
        account_size: 150_000,
        label: 'Ledger one',
        plan_label: 'Rapid 150K',
        plan_serial: null,
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly,
        ...overrides,
    });
}

export function payoutRow(overrides: FakeRow = {}): FakeRow {
    return {
        account_id: IDS.account,
        approved_on: null,
        created_at: CREATED_AT,
        gross_cents: 50_000,
        id: IDS.payout,
        net_cents: 45_000,
        note: null,
        paid_on: '2026-09-10',
        requested_on: '2026-09-08',
        status: PayoutStatus.Paid,
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function planKeyFields(entry: RegistryEntry) {
    return {
        accountSize: entry.plan.id.accountSize,
        firmId: entry.firm.id,
        optIns: NO_PLAN_OPT_INS,
        planSerial: serializePlanId(entry.plan.id),
    };
}

export function rulebookRow(overrides: FakeRow = {}): FakeRow {
    return {
        created_at: CREATED_AT,
        parameters: DEFAULT_RULEBOOK,
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function scenarioRow(overrides: FakeRow = {}): FakeRow {
    return {
        created_at: CREATED_AT,
        id: IDS.scenario,
        name: 'Scenario one',
        query: 'firm=mffu',
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

export function snapshotRow(overrides: FakeRow = {}): FakeRow {
    return {
        account_id: IDS.account,
        as_of: '2026-09-20',
        balance_at_last_payout_cents: null,
        balance_cents: 5_100_000,
        created_at: CREATED_AT,
        cumulative_payout_cents: null,
        cycle_best_day_profit_cents: null,
        dashboard_floor_cents: null,
        eval_best_day_profit_cents: null,
        floor_at_last_payout_cents: null,
        highest_eod_balance_cents: 5_120_000,
        highest_intraday_balance_cents: null,
        id: IDS.snapshot,
        last_payout_on: null,
        last_traded_on: null,
        payouts_taken: 0,
        qualifying_days_since_last_payout: null,
        source: SnapshotSource.Manual,
        trading_days: 3,
        updated_at: CREATED_AT,
        user_id: USER_ID,
        ...overrides,
    };
}

const DEFAULT_ROWS: Readonly<Record<string, () => FakeRow>> = {
    [TABLES.account]: accountRow,
    [TABLES.copyGroup]: copyGroupRow,
    [TABLES.decision]: decisionRow,
    [TABLES.event]: eventRow,
    [TABLES.fee]: feeRow,
    [TABLES.payout]: payoutRow,
    [TABLES.rulebook]: rulebookRow,
    [TABLES.scenario]: scenarioRow,
    [TABLES.snapshot]: snapshotRow,
    [VIDEO_TABLES.bankrollTransfer]: bankrollTransferRow,
    [VIDEO_TABLES.externalFirm]: externalFirmRow,
    [VIDEO_TABLES.firmEngagement]: firmEngagementRow,
    [VIDEO_TABLES.firmStatement]: firmStatementRow,
    [VIDEO_TABLES.round]: roundRow,
    [VIDEO_TABLES.violation]: violationRow,
};

export function callerFor(session: Session, responder: Responder) {
    const { database, queries } = createFakeDatabase(responder);
    const caller = createCallerFactory(propAccountsRouter)({
        db: database,
        headers: new Headers(),
        session: session as never,
    });
    return { caller, queries };
}

export function defined<Value>(value: undefined | Value): Value {
    if (value === undefined) throw new Error('expected a value');
    return value;
}

export function deletesFrom(
    queries: readonly IssuedQuery[],
    table: string,
): IssuedQuery[] {
    return queries.filter((query) =>
        query.text.startsWith(`delete from "${table}"`),
    );
}

export function emptyReadsOf(
    tables: readonly string[],
    responder: Responder = tableResponder(),
): Responder {
    return (query) =>
        !isCount(query) && tables.includes(readTable(query) ?? '')
            ? []
            : responder(query);
}

export function errorShapeOf(
    error: unknown,
    router: RouterWithConfig = propAccountsRouter,
) {
    return getErrorShape({
        config: router._def._config,
        ctx: undefined,
        error: getTRPCErrorFromUnknown(error),
        input: undefined,
        path: undefined,
        type: 'unknown',
    });
}

export function failingWrite(
    table: string,
    error: FakeDatabaseError,
    responder: Responder = tableResponder(),
): Responder {
    return (query) => {
        if (writeTable(query) === table) throw error;
        return responder(query);
    };
}

export function insertsInto(
    queries: readonly IssuedQuery[],
    table: string,
): IssuedQuery[] {
    return queries.filter((query) =>
        query.text.startsWith(`insert into "${table}"`),
    );
}

export function isCount(query: IssuedQuery): boolean {
    return /^select count\(\*\)/i.test(query.text);
}

export function mutationRejection(
    reason: PropMutationRejection,
    lifecycleRejection: LifecycleRejection | null = null,
) {
    return {
        lifecycleRejection,
        limit: null,
        quota: null,
        reason,
        record: null,
        recordId: null,
    };
}

export function propWrites(queries: readonly IssuedQuery[]): IssuedQuery[] {
    return queries.filter((query) =>
        (writeTable(query) ?? '').startsWith('sadranl_prop_'),
    );
}

export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('expected the call to reject');
}

export function tableResponder(
    overrides: Readonly<Record<string, FakeRow[]>> = {},
    counts: Readonly<Record<string, number>> = {},
): Responder {
    return (query) => {
        if (isCount(query)) {
            const table = /from "(\w+)"/.exec(query.text)?.[1] ?? '';
            return [{ count: counts[table] ?? 0 }];
        }
        const table = readTable(query) ?? writeTable(query);
        if (table === null) return [];
        if (writeTable(query) !== null && !/\sreturning\s/i.test(query.text)) {
            return [];
        }
        const override = overrides[table];
        if (override !== undefined) return override;
        const factory = DEFAULT_ROWS[table];
        return factory === undefined ? [] : [factory()];
    };
}

export function updatesOf(
    queries: readonly IssuedQuery[],
    table: string,
): IssuedQuery[] {
    return queries.filter((query) =>
        query.text.startsWith(`update "${table}"`),
    );
}
