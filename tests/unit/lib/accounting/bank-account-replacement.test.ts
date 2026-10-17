import { describe, expect, it, vi } from 'vitest';

import { bankAccountUpsertSchema } from '~/lib/schemas/accounting';
import { accountingRouter } from '~/server/api/routers/accounting';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    FakeDatabaseError,
    type IssuedQuery,
    TransactionStep,
    transactionSteps,
} from '../../server/fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
const current = vi.hoisted(() => ({ database: {} }));

vi.mock('~/server/db', async () => {
    const { databaseSchema } = await import('~/server/db/databaseSchema');
    const db = new Proxy(
        {},
        { get: (_target, key): unknown => Reflect.get(current.database, key) },
    );
    return { ...databaseSchema, db };
});
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/crypto/secrets', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    openSecret: () => Promise.resolve('secret'),
}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const ROOT = { user: { email: 'root@x.test', id: 'root-1', role: 'root' } };
const CREDENTIAL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OLD_MAPPING_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const CREDENTIAL_ROW = {
    ciphertext: 'sealed',
    created_at: new Date('2026-01-01T00:00:00Z'),
    id: CREDENTIAL_ID,
    is_active: true,
    kind: 'moneybird',
    label: 'Main',
    meta: {},
    updated_at: new Date('2026-01-01T00:00:00Z'),
    user_id: 'root-1',
};

function deletes(queries: readonly IssuedQuery[]): IssuedQuery[] {
    return queries.filter((query) => /^delete from/i.test(query.text));
}

describe('bankAccounts.upsert replacing a mapping', () => {
    it('keeps the old mapping when saving the replacement fails', async () => {
        const { database, queries } = createFakeDatabase((query) => {
            if (/^insert into/i.test(query.text)) {
                throw new FakeDatabaseError('23503', 'bank_account_fk');
            }
            return query.text.startsWith('select') ? [CREDENTIAL_ROW] : [];
        });
        current.database = database;
        const caller = createCallerFactory(
            createTRPCRouter({ accounting: accountingRouter }),
        )({ db: database, headers: new Headers(), session: ROOT as never });

        await expect(
            caller.accounting.bankAccounts.upsert({
                credentialId: CREDENTIAL_ID,
                currency: 'USD',
                ledger: { id: '42', label: 'Bank USD' },
                replacesId: OLD_MAPPING_ID,
            }),
        ).rejects.toThrow();

        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Rollback,
        ]);
    });

    it('rejects an invalid replacement currency before touching the old mapping', () => {
        expect(
            bankAccountUpsertSchema.safeParse({
                credentialId: CREDENTIAL_ID,
                currency: 'EU',
                ledger: { id: '42', label: 'Bank' },
                replacesId: OLD_MAPPING_ID,
            }).success,
        ).toBe(false);
    });

    it('removes the replaced mapping in the same transaction as the new one', async () => {
        const { database, queries } = createFakeDatabase((query) =>
            query.text.startsWith('select') ? [CREDENTIAL_ROW] : [],
        );
        current.database = database;
        const caller = createCallerFactory(
            createTRPCRouter({ accounting: accountingRouter }),
        )({ db: database, headers: new Headers(), session: ROOT as never });

        await caller.accounting.bankAccounts.upsert({
            credentialId: CREDENTIAL_ID,
            currency: 'USD',
            ledger: { id: '42', label: 'Bank USD' },
            replacesId: OLD_MAPPING_ID,
        });

        expect(deletes(queries)).toHaveLength(1);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });
});
