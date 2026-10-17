import { describe, expect, it, vi } from 'vitest';

import { RunId, UserId } from '~/lib/accounting/core/ids';
import { accountingRunRepo } from '~/lib/accounting/runs/repo';

import type { IssuedQuery } from '../../server/fakeDatabase';

const fake = vi.hoisted(() => ({ queries: [] as IssuedQuery[] }));

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', async () => {
    const { databaseSchema } = await import('~/server/db/databaseSchema');
    const { createFakeDatabase } = await import('../../server/fakeDatabase');
    const ledger = { id: '1', label: 'Ledger' };
    const booking = (txnId: string) => ({
        amountEur: 10,
        bank: ledger,
        counterpartLedger: ledger,
        counterpartName: 'Shop',
        date: '2026-01-02',
        direction: 'OUT',
        notes: [],
        sourceCurrency: 'EUR',
        taxCode: 'NONE',
        txnId,
    });
    const runRow = {
        accounting_credential_id: null,
        api_credential_ids: [],
        bookings: [booking('txn-a'), booking('txn-b')],
        created_at: new Date('2026-01-03T00:00:00Z'),
        error_message: null,
        id: 'run-1',
        outcomes: {},
        start_date: '2026-01-01',
        status: 'planned',
        summary: {},
        updated_at: new Date('2026-01-03T00:00:00Z'),
        user_id: 'user-1',
    };
    const { database, queries } = createFakeDatabase((query) => [
        query.text.startsWith('select') ? runRow : { id: 'run-1' },
    ]);
    fake.queries = queries;
    return { ...databaseSchema, db: database };
});

const RUN = RunId('run-1');
const USER = UserId('user-1');

function updates(): IssuedQuery[] {
    return fake.queries.filter((query) => /^update/i.test(query.text));
}

describe('accountingRunRepo.updateBooking', () => {
    it('writes only the edited booking so overlapping edits cannot revert each other', async () => {
        await Promise.all([
            accountingRunRepo.updateBooking(RUN, USER, 'txn-a', {
                taxCode: 'HIGH',
            }),
            accountingRunRepo.updateBooking(RUN, USER, 'txn-b', {
                counterpartName: 'Cafe',
            }),
        ]);

        const [first, second] = updates();
        expect(updates()).toHaveLength(2);
        expect(JSON.stringify(first?.params)).not.toContain('txn-b');
        expect(JSON.stringify(second?.params)).not.toContain('txn-a');
    });
});
