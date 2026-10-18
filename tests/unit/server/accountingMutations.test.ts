import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IsoDate } from '~/lib/accounting/core/date';
import { CredentialKind } from '~/lib/accounting/credentials/index';
import { accountingRouter } from '~/server/api/routers/accounting';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    FakeEBoekhoudenApi,
    type FakeMutation,
} from '../lib/accounting/eboekhouden-fake-api';
import { assertUserScopedWhere, createFakeDatabase } from './fakeDatabase';

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

const ROOT_ID = 'root-1';
const ROOT = { user: { email: 'root@x.test', id: ROOT_ID, role: 'root' } };
const CREDENTIAL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const TODAY = new Date('2026-10-18T12:00:00');
const FIRST_BOOKING_DAY = IsoDate.parse('2025-06-01');
const BOOKINGS_PER_DAY = 6;
const BOOKED_DAYS = 494;
const PAGE = 25;

const LEDGER: FakeMutation[] = Array.from(
    { length: BOOKED_DAYS * BOOKINGS_PER_DAY },
    (_, index) => ({
        date: IsoDate.addDays(
            FIRST_BOOKING_DAY,
            Math.floor(index / BOOKINGS_PER_DAY),
        ),
        id: index + 1,
    }),
);

const CREDENTIAL_ROW = {
    ciphertext: 'sealed',
    created_at: new Date('2026-01-01T00:00:00Z'),
    id: CREDENTIAL_ID,
    is_active: true,
    kind: CredentialKind.EBoekhouden,
    label: 'Main',
    meta: {},
    updated_at: new Date('2026-01-01T00:00:00Z'),
    user_id: ROOT_ID,
};

function callerWithCredential() {
    const { database, queries } = createFakeDatabase((query) =>
        query.text.startsWith('select') ? [CREDENTIAL_ROW] : [],
    );
    current.database = database;
    const caller = createCallerFactory(
        createTRPCRouter({ accounting: accountingRouter }),
    )({ db: database, headers: new Headers(), session: ROOT as never });
    return { caller, queries };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('accounting mutations router', () => {
    it('turns a page with only the requests that page needs, without recounting the ledger', async () => {
        const api = FakeEBoekhoudenApi.serve(LEDGER);
        const { caller } = callerWithCredential();

        const page = await caller.accounting.mutations.list({
            credentialId: CREDENTIAL_ID,
            limit: PAGE,
            offset: PAGE,
        });

        expect(api.mutationRequests).toHaveLength(1);
        expect(page).toHaveLength(PAGE);
    });

    it('counts the mutations of a date range on its own, for the caller only', async () => {
        FakeEBoekhoudenApi.serve(LEDGER);
        const { caller, queries } = callerWithCredential();

        const total = await caller.accounting.mutations.count({
            credentialId: CREDENTIAL_ID,
        });
        const october = await caller.accounting.mutations.count({
            credentialId: CREDENTIAL_ID,
            dateFrom: '2026-10-01',
            dateTo: '2026-10-07',
        });

        expect(total).toBe(LEDGER.length);
        expect(october).toBe(7 * BOOKINGS_PER_DAY);
        const reads = queries.filter((query) =>
            query.text.startsWith('select'),
        );
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) assertUserScopedWhere(read, ROOT_ID);
    });
});
