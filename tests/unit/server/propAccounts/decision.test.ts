import { describe, expect, it, vi } from 'vitest';

import { AccountStage } from '~/lib/prop-accounts';

import {
    assertUserScopedWhere,
    insertedColumnValues,
    readTable,
} from '../fakeDatabase';
import {
    callerFor,
    defined,
    IDS,
    insertsInto,
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
    source: 'documented',
    stage: AccountStage.Eval,
};

describe('propAccounts.decision', () => {
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
