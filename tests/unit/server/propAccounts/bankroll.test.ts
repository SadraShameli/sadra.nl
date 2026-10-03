import { describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import { BankrollTransferKind } from '~/lib/prop-accounts';
import { PROP_QUOTA_LIMITS } from '~/lib/prop-accounts/server';
import {
    PropLimitRejection,
    PropQuota,
} from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    insertedColumnValues,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    callerFor,
    defined,
    deletesFrom,
    errorShapeOf,
    insertsInto,
    isCount,
    propWrites,
    rejectionOf,
    SIGNED_IN,
    tableResponder,
    updatesOf,
    USER_ID,
} from './propRouterHarness';
import { VIDEO_IDS, VIDEO_TABLES } from './videoRecordFixtures';

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

const rateLimit = vi.mocked(isWithinRateLimit);

const DEPOSIT = {
    amountCents: 500_000,
    kind: BankrollTransferKind.Deposit,
    occurredOn: '2026-09-01',
};

const WITHDRAWAL_UPDATE = {
    amountCents: 120_000,
    id: VIDEO_IDS.bankrollTransfer,
    kind: BankrollTransferKind.Withdrawal,
    note: 'Paid rent',
    occurredOn: '2026-09-15',
};

describe('propAccounts.bankroll', () => {
    it('create records a deposit for the session user after the quota check, in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const created = await caller.bankroll.create(DEPOSIT);
        expect(created.amountCents).toBe(500_000);
        const count = queries.find((query) => isCount(query));
        expect(readTable(defined(count))).toBe(VIDEO_TABLES.bankrollTransfer);
        assertUserScopedWhere(defined(count), USER_ID);
        const [insert] = insertsInto(queries, VIDEO_TABLES.bankrollTransfer);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(insert), 'amount_cents')).toEqual([
            500_000,
        ]);
        expect(insertedColumnValues(defined(insert), 'kind')).toEqual([
            BankrollTransferKind.Deposit,
        ]);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('create rejects a zero or fractional-cent amount before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        for (const amountCents of [0, -100, 10.5]) {
            await expect(
                caller.bankroll.create({ ...DEPOSIT, amountCents }),
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        }
        expect(queries).toHaveLength(0);
    });

    it('create fails loud at the bankroll transfer quota and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder(
                {},
                {
                    [VIDEO_TABLES.bankrollTransfer]:
                        PROP_QUOTA_LIMITS[PropQuota.BankrollTransfers],
                },
            ),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.bankroll.create(DEPOSIT)),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection).toMatchObject({
            quota: PropQuota.BankrollTransfers,
            reason: PropLimitRejection.QuotaExceeded,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rate-limits changes in the bankroll bucket per user', async () => {
        rateLimit.mockClear();
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await caller.bankroll.create(DEPOSIT);
        expect(rateLimit).toHaveBeenCalledWith(
            expect.objectContaining({
                bucket: 'prop-accounts:bankroll',
                key: USER_ID,
            }),
        );
    });

    it('list returns the caller transfers from a scoped, bounded read', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const transfers = await caller.bankroll.list();
        expect(transfers.map((row) => row.kind)).toEqual([
            BankrollTransferKind.Deposit,
        ]);
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.text).toMatch(/ limit \$\d+$/);
    });

    it('update and remove load the owned transfer first and write with id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.bankroll.update(WITHDRAWAL_UPDATE);
        await caller.bankroll.remove({ id: VIDEO_IDS.bankrollTransfer });
        const [update] = updatesOf(queries, VIDEO_TABLES.bankrollTransfer);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                120_000,
                BankrollTransferKind.Withdrawal,
                'Paid rent',
                '2026-09-15',
            ]),
        );
        const [removal] = deletesFrom(queries, VIDEO_TABLES.bankrollTransfer);
        for (const write of [update, removal]) {
            assertUserScopedWhere(defined(write), USER_ID);
            expect(write?.params).toContain(VIDEO_IDS.bankrollTransfer);
        }
        expect(propWrites(queries)).toHaveLength(2);
    });

    it('summary computes the caller bankroll from their own scoped accounts, fees, payouts and transfers', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const summary = await caller.bankroll.summary();
        expect(summary).toMatchObject({
            availableCents: 528_500,
            depositsCents: 500_000,
            reinvestedPayoutsCents: 0,
            undatedPaidPayouts: 0,
            withdrawalsCents: 0,
        });
        expect(summary).not.toHaveProperty('grownFromCents');
        const reads = queries.filter((query) => !isCount(query));
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) {
            assertUserScopedWhere(read, USER_ID);
        }
    });

    it('update and remove of another user transfer throw NOT_FOUND and write nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.bankrollTransfer]: [] }),
        );
        await expect(
            caller.bankroll.update(WITHDRAWAL_UPDATE),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
            caller.bankroll.remove({ id: VIDEO_IDS.bankrollTransfer }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });
});
