import { describe, expect, it, vi } from 'vitest';

import { captureError } from '~/lib/observability/logger';
import {
    assertUserScopedWhere,
    type FakeRow,
    type IssuedQuery,
} from '../fakeDatabase';
import {
    accountRow,
    accountUpdateInput,
    callerFor,
    IDS,
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

const CORRUPT_TAGS = { mff: true };

let versionClock = Date.UTC(2026, 8, 2);

function corruptRow(overrides: FakeRow = {}): FakeRow {
    versionClock += 60_000;
    return accountRow({
        tags: CORRUPT_TAGS,
        updated_at: new Date(versionClock),
        ...overrides,
    });
}

function isAccountWrite(query: IssuedQuery): boolean {
    return query.text.startsWith(`update "${TABLES.account}"`);
}

function repairingResponder(
    stored: FakeRow,
    repaired: FakeRow,
): (query: IssuedQuery) => FakeRow[] {
    const base = tableResponder({ [TABLES.account]: [stored] });
    const afterWrite = tableResponder({ [TABLES.account]: [repaired] });
    return (query) => (isAccountWrite(query) ? afterWrite(query) : base(query));
}

describe('propAccounts.account: a corrupt stored tags value is read tolerantly and repaired by an edit (QF-8)', () => {
    it('update repairs an account whose stored tags are corrupt by writing valid tags', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            repairingResponder(
                corruptRow(),
                accountRow({ tags: ['mff'] }),
            ),
        );
        const updated = await caller.account.update(
            accountUpdateInput({ tags: ['mff'] }),
        );
        expect(updated.tags).toEqual(['mff']);
        expect(updated.readIssues).toEqual([]);
        expect(updated.hasCorruptTags).toBeUndefined();
        expect(updatesOf(queries, TABLES.account)).toHaveLength(1);
    });

    it('get returns an account with corrupt tags as no tags and names the issue', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [corruptRow()],
            }),
        );
        const account = await caller.account.get({ id: IDS.account });
        expect(account.tags).toEqual([]);
        expect(account.readIssues).toEqual([]);
        expect(account.hasCorruptTags).toBe(true);
    });

    it('list names the issue on the corrupt row before the repair and not after', async () => {
        const before = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [corruptRow()],
            }),
        );
        const [corrupt] = await before.caller.account.list({});
        expect(corrupt?.readIssues).toEqual([]);
        expect(corrupt?.hasCorruptTags).toBe(true);

        const after = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ tags: ['mff'] })],
            }),
        );
        const [repaired] = await after.caller.account.list({});
        expect(repaired?.readIssues).toEqual([]);
        expect(repaired?.hasCorruptTags).toBeUndefined();
        expect(repaired?.tags).toEqual(['mff']);
    });

    it('a null stored tags value is no tags and no issue', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [accountRow({ tags: null })] }),
        );
        const account = await caller.account.get({ id: IDS.account });
        expect(account.tags).toEqual([]);
        expect(account.readIssues).toEqual([]);
    });

    it('reports a corrupt value to the error log once per stored row version, not once per read', async () => {
        vi.mocked(captureError).mockClear();
        const stored = corruptRow();
        for (const _read of [1, 2, 3]) {
            const { caller } = callerFor(
                SIGNED_IN,
                tableResponder({ [TABLES.account]: [stored] }),
            );
            await caller.account.get({ id: IDS.account });
            await caller.account.list({});
        }
        expect(captureError).toHaveBeenCalledTimes(1);
    });

    it('reports the value again when the row is rewritten and is corrupt again', async () => {
        vi.mocked(captureError).mockClear();
        for (const stored of [corruptRow(), corruptRow()]) {
            const { caller } = callerFor(
                SIGNED_IN,
                tableResponder({ [TABLES.account]: [stored] }),
            );
            await caller.account.get({ id: IDS.account });
        }
        expect(captureError).toHaveBeenCalledTimes(2);
    });

    it('does not report a null or a valid tags value', async () => {
        vi.mocked(captureError).mockClear();
        for (const tags of [null, ['mff']]) {
            const { caller } = callerFor(
                SIGNED_IN,
                tableResponder({ [TABLES.account]: [accountRow({ tags })] }),
            );
            await caller.account.get({ id: IDS.account });
        }
        expect(captureError).not.toHaveBeenCalled();
    });

    it('keeps corrupt personal rules strict on update while tags are tolerant', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    corruptRow({
                        personal_rules: { maxTradesPerDay: 'many' },
                    }),
                ],
            }),
        );
        await expect(
            caller.account.update(accountUpdateInput({ tags: ['mff'] })),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    });

    it('scopes every account query of the repair by the signed-in user', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            repairingResponder(
                corruptRow(),
                accountRow({ tags: ['mff'] }),
            ),
        );
        await caller.account.update(accountUpdateInput({ tags: ['mff'] }));
        const accountQueries = queries.filter(
            (query) =>
                (query.text.startsWith('select') ||
                    query.text.startsWith('update')) &&
                query.text.includes(`"${TABLES.account}"`) &&
                !query.text.includes('count('),
        );
        expect(accountQueries.length).toBeGreaterThan(0);
        for (const query of accountQueries) {
            assertUserScopedWhere(query, USER_ID);
        }
    });
});
