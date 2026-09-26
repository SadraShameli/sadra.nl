import { describe, expect, it, vi } from 'vitest';

import { FeeKind } from '~/lib/prop-accounts';

import {
    assertUserScopedWhere,
    insertedColumnValues,
    readTable,
} from '../fakeDatabase';
import {
    callerFor,
    defined,
    deletesFrom,
    feeRow,
    IDS,
    insertsInto,
    isCount,
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

describe('propAccounts.fee', () => {
    it('create records a Refund against the owned account for the session user', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [
                    feeRow({ amount_cents: 8000, kind: FeeKind.Refund }),
                ],
            }),
        );
        const created = await caller.fee.create({
            accountId: IDS.account,
            amountCents: 8000,
            kind: FeeKind.Refund,
            paidOn: '2026-09-15',
        });
        expect(created.kind).toBe(FeeKind.Refund);
        const load = queries.find(
            (query) => readTable(query) === TABLES.account && !isCount(query),
        );
        assertUserScopedWhere(defined(load), USER_ID);
        const [insert] = insertsInto(queries, TABLES.fee);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(insert), 'kind')).toEqual([
            FeeKind.Refund,
        ]);
    });

    it('rejects a negative amount before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.fee.create({
                accountId: IDS.account,
                amountCents: -1,
                kind: FeeKind.Refund,
                paidOn: '2026-09-15',
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('update and remove load the owned fee first and write with id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.fee.update({
            amountCents: 17_000,
            id: IDS.fee,
            kind: FeeKind.Reset,
            note: 'reset after a bad day',
            paidOn: '2026-09-02',
        });
        await caller.fee.remove({ id: IDS.fee });
        for (const write of [
            updatesOf(queries, TABLES.fee)[0],
            deletesFrom(queries, TABLES.fee)[0],
        ]) {
            assertUserScopedWhere(defined(write), USER_ID);
            expect(write?.params).toContain(IDS.fee);
        }
        expect(propWrites(queries)).toHaveLength(2);
    });

    it('list is bounded and scoped', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.fee.list({ accountId: IDS.account });
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.params).toContain(IDS.account);
        expect(list?.text).toMatch(/ limit \$\d+$/);
    });
});
