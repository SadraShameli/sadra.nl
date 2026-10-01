import { describe, expect, it, vi } from 'vitest';

import { AccountStage } from '~/lib/prop-accounts';
import { AdviceSource } from '~/lib/prop-calculator/advisor';
import { PropMutationRejection } from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    insertedColumnValues,
    readTable,
} from '../fakeDatabase';
import {
    callerFor,
    defined,
    errorShapeOf,
    IDS,
    insertsInto,
    ledgerOnlyAccountRow,
    mutationRejection,
    propWrites,
    rejectionOf,
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
vi.mock('~/lib/observability/rate-limit', () => ({
    isWithinRateLimit: vi.fn(() => Promise.resolve(true)),
}));

const DECISION = {
    acceptedRiskCents: 40_000,
    acceptedRungsCents: [40_000, 60_000],
    accountId: IDS.account,
    decidedOn: '2026-09-21',
    headlineRiskCents: 40_000,
    snapshotId: IDS.snapshot,
    source: AdviceSource.Documented,
    stage: AccountStage.Eval,
};

describe('propAccounts.decision', () => {
    it('create refuses a ledger-only account, which has no plan rules to size from, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [ledgerOnlyAccountRow()] }),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.decision.create(DECISION)),
        );
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('"Ledger one"');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.NotModeledForOperation),
        );
        const load = queries.find(
            (query) => readTable(query) === TABLES.account,
        );
        assertUserScopedWhere(defined(load), USER_ID);
        expect(
            queries.filter((query) => readTable(query) === TABLES.snapshot),
        ).toHaveLength(0);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create rejects a foreign snapshot id with NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.snapshot]: [] }),
        );
        await expect(caller.decision.create(DECISION)).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create looks the snapshot up by id, account and user', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.decision.create(DECISION);
        const snapshotLoad = queries.find(
            (query) => readTable(query) === TABLES.snapshot,
        );
        assertUserScopedWhere(defined(snapshotLoad), USER_ID);
        expect(snapshotLoad?.params).toEqual(
            expect.arrayContaining([IDS.snapshot, IDS.account]),
        );
        expect(snapshotLoad?.text).toMatch(/"account_id" = \$\d+/);
        const [insert] = insertsInto(queries, TABLES.decision);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
    });

    it('create without a snapshot skips the snapshot lookup', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.decision.create({ ...DECISION, snapshotId: null });
        expect(
            queries.filter((query) => readTable(query) === TABLES.snapshot),
        ).toHaveLength(0);
    });

    it('list filters by account only on top of the user scope, and never returns another user row', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.decision.list({});
        await caller.decision.list({ accountId: IDS.account });
        const [all, one] = queries;
        assertUserScopedWhere(defined(all), USER_ID);
        expect(all?.text).not.toMatch(/"account_id" = /);
        expect(all?.text).toMatch(/ limit \$\d+$/);
        assertUserScopedWhere(defined(one), USER_ID);
        expect(one?.params).toContain(IDS.account);
    });

    it('latestForAll returns at most one row per account, userId-scoped', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.decision.latestForAll();
        const [latest] = queries;
        assertUserScopedWhere(defined(latest), USER_ID);
        expect(latest?.text).toMatch(
            /^select distinct on \((?:"\w+"\.)?"account_id"\)/,
        );
        expect(latest?.text).toMatch(
            /order by (?:"\w+"\.)?"account_id", (?:"\w+"\.)?"decided_on" desc, (?:"\w+"\.)?"created_at" desc, (?:"\w+"\.)?"id" desc/,
        );
    });

    it('recordActual updates the owned decision by id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.decision.recordActual({
            actualRiskCents: 30_000,
            id: IDS.decision,
        });
        const [update] = updatesOf(queries, TABLES.decision);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([30_000, IDS.decision]),
        );
    });
});
