import { describe, expect, it, vi } from 'vitest';

import { PayoutStatus } from '~/lib/prop-accounts';

import {
    assertUserScopedWhere,
    FakeDatabaseError,
    insertedColumnValues,
    readTable,
} from '../fakeDatabase';
import {
    callerFor,
    defined,
    deletesFrom,
    errorShapeOf,
    failingWrite,
    IDS,
    insertsInto,
    isCount,
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

const PAID = {
    grossCents: 50_000,
    netCents: 45_000,
    note: null,
    paidOn: '2026-09-10',
    requestedOn: '2026-09-08',
    status: PayoutStatus.Paid,
};

describe('propAccounts.payout', () => {
    it('create loads the owned account, then inserts for the session user', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const created = await caller.payout.create({
            ...PAID,
            accountId: IDS.account,
        });
        expect(created.grossCents).toBe(50_000);
        const load = queries.find(
            (query) => readTable(query) === TABLES.account && !isCount(query),
        );
        assertUserScopedWhere(defined(load), USER_ID);
        expect(load?.params).toContain(IDS.account);
        const [insert] = insertsInto(queries, TABLES.payout);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(insert), 'account_id')).toEqual([
            IDS.account,
        ]);
    });

    it('create rejects a paid payout without a paid date before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.payout.create({
                ...PAID,
                accountId: IDS.account,
                paidOn: null,
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('update and remove load the owned payout first and write with id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.payout.update({ ...PAID, id: IDS.payout });
        await caller.payout.remove({ id: IDS.payout });
        const [update] = updatesOf(queries, TABLES.payout);
        const [removal] = deletesFrom(queries, TABLES.payout);
        for (const write of [update, removal]) {
            assertUserScopedWhere(defined(write), USER_ID);
            expect(write?.params).toContain(IDS.payout);
        }
        expect(propWrites(queries)).toHaveLength(2);
    });

    it('list filters by account only on top of the user scope', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.payout.list({});
        await caller.payout.list({ accountId: IDS.account });
        const [all, one] = queries;
        assertUserScopedWhere(defined(all), USER_ID);
        expect(all?.text).not.toMatch(/"account_id" = /);
        assertUserScopedWhere(defined(one), USER_ID);
        expect(one?.params).toContain(IDS.account);
        expect(all?.text).toMatch(/ limit \$\d+$/);
    });

    it('create stores the approval date for the session user', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.payout.create({
            ...PAID,
            accountId: IDS.account,
            approvedOn: '2026-09-09',
        });
        const [insert] = insertsInto(queries, TABLES.payout);
        expect(insertedColumnValues(defined(insert), 'approved_on')).toEqual([
            '2026-09-09',
        ]);
    });

    it('update writes the approval date, and clears it when sent as null', async () => {
        for (const approvedOn of ['2026-09-09', null]) {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            await caller.payout.update({ ...PAID, approvedOn, id: IDS.payout });
            const [update] = updatesOf(queries, TABLES.payout);
            assertUserScopedWhere(defined(update), USER_ID);
            expect(update?.text).toMatch(/"approved_on" = \$\d+/);
            if (approvedOn !== null) {
                expect(update?.params).toContain(approvedOn);
            }
        }
    });

    it('update without an approval date keeps the stored one', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.payout.update({ ...PAID, id: IDS.payout });
        const [update] = updatesOf(queries, TABLES.payout);
        expect(update?.text).not.toMatch(/"approved_on" = /);
    });

    it.each([
        {
            approvedOn: '2026-09-07',
            message: 'a payout cannot be approved before it was requested',
        },
        {
            approvedOn: '2026-09-11',
            message: 'a payout cannot be paid before it was approved',
        },
    ])(
        'create and update reject the approval date $approvedOn out of order before touching the database',
        async ({ approvedOn, message }) => {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            for (const call of [
                () =>
                    caller.payout.create({
                        ...PAID,
                        accountId: IDS.account,
                        approvedOn,
                    }),
                () =>
                    caller.payout.update({
                        ...PAID,
                        approvedOn,
                        id: IDS.payout,
                    }),
            ]) {
                const error = await rejectionOf(call());
                expect(errorShapeOf(error).data.code).toBe('BAD_REQUEST');
                expect(String(error)).toContain(message);
            }
            expect(queries).toHaveLength(0);
        },
    );

    it.each([
        [
            'prop_payout_approved_after_request_ck',
            'A payout cannot be approved before it was requested',
        ],
        [
            'prop_payout_paid_after_approval_ck',
            'A payout cannot be paid before it was approved',
        ],
    ])(
        'update maps the stored approval date failing %s to a BAD_REQUEST the user can act on',
        async (constraint, message) => {
            const { caller } = callerFor(
                SIGNED_IN,
                failingWrite(
                    TABLES.payout,
                    new FakeDatabaseError('23514', constraint),
                ),
            );
            const shape = errorShapeOf(
                await rejectionOf(
                    caller.payout.update({ ...PAID, id: IDS.payout }),
                ),
            );
            expect(shape.data.code).toBe('BAD_REQUEST');
            expect(shape.message).toBe(message);
        },
    );
});
