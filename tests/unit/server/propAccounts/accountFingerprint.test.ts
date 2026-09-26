import { describe, expect, it, vi } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    readAccountEventDetail,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { planRulesFingerprint } from '~/lib/prop-calculator/describe';
import { findFirm } from '~/lib/prop-calculator/firms';

import {
    assertUserScopedWhere,
    insertedColumnValues,
    type IssuedQuery,
} from '../fakeDatabase';
import {
    accountCreateInput,
    accountRow,
    accountUpdateInput,
    callerFor,
    defined,
    insertsInto,
    ledgerOnlyAccountRow,
    propWrites,
    SIGNED_IN,
    tableResponder,
    TABLES,
    updatesOf,
    USER_ID,
} from './propRouterHarness';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ fanOutEvent: vi.fn() }));
vi.mock('~/lib/observability/logger', () => ({ captureError: vi.fn() }));
vi.mock('~/lib/observability/rate-limit', () => ({
    isWithinRateLimit: vi.fn(() => Promise.resolve(true)),
}));

interface Entry {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

function registryEntry(isMatch: (plan: Plan) => boolean): Entry {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isMatch);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no registry plan matches');
}

function resolvedPlan(firmId: string, planSerial: string): Plan {
    const plan = findFirm(firmId as FirmId)?.findPlanBySerial(planSerial);
    if (plan === null || plan === undefined) {
        throw new Error(`plan not found: ${firmId} ${planSerial}`);
    }
    return plan;
}

function setClauseOf(query: IssuedQuery): string {
    const match = /\sset\s(.*?)\swhere\s/is.exec(query.text);
    if (!match?.[1]) throw new Error(`No SET clause in ${query.text}`);
    return match[1];
}

function setColumnValue(query: IssuedQuery, column: string): unknown {
    const match = new RegExp(String.raw`"${column}" = \$(\d+)`).exec(
        setClauseOf(query),
    );
    if (!match?.[1]) throw new Error(`No column ${column} in ${query.text}`);
    return query.params[Number(match[1]) - 1];
}

const DEFAULT_ROW = accountRow();
const DEFAULT_PLAN = resolvedPlan(
    String(DEFAULT_ROW.firm_id),
    String(DEFAULT_ROW.plan_serial),
);

const OTHER_EVAL_ENTRY = registryEntry(
    (plan) =>
        !plan.isInstantFunded &&
        serializePlanId(plan.id) !== String(DEFAULT_ROW.plan_serial),
);

const RESET_OPT_IN_ENTRY = registryEntry(
    (plan) => !plan.isInstantFunded && plan.fundedReset !== null,
);

function ledgerOnlyUpdateInput(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 150_000,
        copyGroupId: null,
        dashboardConvention: accountCreateInput().dashboardConvention,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: String(DEFAULT_ROW.id),
        label: 'Rapid 150K',
        liveStartBalanceCents: null,
        notes: 'changed',
        personalRules: {},
        planLabel: 'Rapid 150K',
        purchasedOn: '2026-09-01',
        replacesAccountId: null,
        tags: [],
        tracking: AccountTracking.LedgerOnly as const,
        ...overrides,
    };
}

describe('propAccounts.account: plan-rule fingerprint stamping (PT-45)', () => {
    it('create stamps the fingerprint of the resolved plan', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.create(accountCreateInput());
        const [insert] = insertsInto(queries, TABLES.account);
        const expected = await planRulesFingerprint(DEFAULT_PLAN);
        expect(
            insertedColumnValues(defined(insert), 'plan_rules_fingerprint'),
        ).toEqual([expected]);
    });

    it('create stamps the fingerprint with the opt-ins taken, not the bare plan', async () => {
        const { firm, plan } = RESET_OPT_IN_ENTRY;
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.create(
            accountCreateInput({
                accountSize: plan.id.accountSize,
                firmId: firm.id,
                optIns: { ...NO_PLAN_OPT_INS, takesFundedReset: true },
                planSerial: serializePlanId(plan.id),
            }),
        );
        const [insert] = insertsInto(queries, TABLES.account);
        const bare = await planRulesFingerprint(plan);
        const [stamped] = insertedColumnValues(
            defined(insert),
            'plan_rules_fingerprint',
        );
        expect(stamped).not.toBe(bare);
    });

    it('importMany stamps every resolved row and leaves a ledger-only row null', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.importMany([
            accountCreateInput({ label: 'One' }),
            {
                accountSize: 150_000,
                dashboardConvention: accountCreateInput().dashboardConvention,
                firmId: FirmId.Mffu,
                label: 'Ledger one',
                planLabel: 'Rapid 150K',
                purchasedOn: '2026-09-01',
                stage: AccountStage.Funded,
                tracking: AccountTracking.LedgerOnly as const,
            },
        ]);
        const [insert] = insertsInto(queries, TABLES.account);
        const expected = await planRulesFingerprint(DEFAULT_PLAN);
        expect(
            insertedColumnValues(defined(insert), 'plan_rules_fingerprint'),
        ).toEqual([expected, null]);
    });

    it('an update that changes the plan key restamps the fingerprint with an Edited change', async () => {
        const { firm, plan } = OTHER_EVAL_ENTRY;
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.update(
            accountUpdateInput({
                accountSize: plan.id.accountSize,
                firmId: firm.id,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(plan.id),
            }),
        );
        const [update] = updatesOf(queries, TABLES.account);
        assertUserScopedWhere(defined(update), USER_ID);
        const expected = await planRulesFingerprint(plan);
        expect(setColumnValue(defined(update), 'plan_rules_fingerprint')).toBe(
            expected,
        );
        const [eventInsert] = insertsInto(queries, TABLES.event);
        const [detail] = insertedColumnValues(defined(eventInsert), 'detail');
        const changes = readAccountEventDetail(
            typeof detail === 'string' ? JSON.parse(detail) : detail,
        ).changes;
        expect(changes.some((change) => change.field === 'planSerial')).toBe(
            true,
        );
        expect(insertedColumnValues(defined(eventInsert), 'kind')).toEqual([
            AccountEventKind.Edited,
        ]);
    });

    it('a real edit on a null stored fingerprint backfills it with an Edited change', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ plan_rules_fingerprint: null }),
                ],
            }),
        );
        await caller.account.update(accountUpdateInput({ label: 'Renamed' }));
        const [update] = updatesOf(queries, TABLES.account);
        const expected = await planRulesFingerprint(DEFAULT_PLAN);
        expect(setColumnValue(defined(update), 'plan_rules_fingerprint')).toBe(
            expected,
        );
        expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
    });

    it('an unrelated edit with the plan key unchanged leaves a stale non-null fingerprint untouched', async () => {
        const stale = 'x'.repeat(64);
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ plan_rules_fingerprint: stale }),
                ],
            }),
        );
        await caller.account.update(accountUpdateInput({ label: 'Renamed' }));
        const [update] = updatesOf(queries, TABLES.account);
        expect(setClauseOf(defined(update))).not.toContain(
            'plan_rules_fingerprint',
        );
    });

    it('a no-change update writes nothing and never touches the fingerprint', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ plan_rules_fingerprint: null }),
                ],
            }),
        );
        const result = await caller.account.update(accountUpdateInput());
        expect(result.planRulesFingerprint).toBeNull();
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('a ledger-only account is never stamped by update', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [ledgerOnlyAccountRow()] }),
        );
        await caller.account.update(ledgerOnlyUpdateInput());
        const [update] = updatesOf(queries, TABLES.account);
        expect(setClauseOf(defined(update))).not.toContain(
            'plan_rules_fingerprint',
        );
    });

    it('list reports planRulesChanged null for an unstamped account and for one with an unresolvable plan', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ plan_rules_fingerprint: null }),
                    accountRow({
                        id: '22222222-2222-4222-8222-222222222222',
                        plan_rules_fingerprint: 'stale-hash',
                        plan_serial: 'retired-plan',
                    }),
                ],
            }),
        );
        const listed = await caller.account.list({});
        expect(listed.map((account) => account.planRulesChanged)).toEqual([
            null,
            null,
        ]);
    });

    it('list reports planRulesChanged accurately and memoises the fingerprint per plan key', async () => {
        const stale = 'x'.repeat(64);
        const fresh = await planRulesFingerprint(DEFAULT_PLAN);
        const digestSpy = vi.spyOn(crypto.subtle, 'digest');
        digestSpy.mockClear();
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        id: '33333333-3333-4333-8333-333333333333',
                        plan_rules_fingerprint: stale,
                    }),
                    accountRow({
                        id: '44444444-4444-4444-8444-444444444444',
                        plan_rules_fingerprint: fresh,
                    }),
                ],
            }),
        );
        const listed = await caller.account.list({});
        expect(listed.map((account) => account.planRulesChanged)).toEqual([
            true,
            false,
        ]);
        expect(digestSpy).toHaveBeenCalledTimes(1);
        digestSpy.mockRestore();
    });

    it('get reports planRulesChanged for a single resolved, stamped account', async () => {
        const stale = 'x'.repeat(64);
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ plan_rules_fingerprint: stale }),
                ],
            }),
        );
        const account = await caller.account.get({
            id: String(DEFAULT_ROW.id),
        });
        expect(account.planRulesChanged).toBe(true);
    });
});
