import { describe, expect, it, vi } from 'vitest';

import { compareText } from '~/lib/prop-accounts/core';
import {
    PROP_QUOTA_LIMITS,
    PropAccountRepo,
    PropListTooLargeError,
} from '~/lib/prop-accounts/server';
import { PropQuota, PropRecord } from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    readTable,
} from '../fakeDatabase';
import { IDS, snapshotRow, TABLES, USER_ID } from './propRouterHarness';

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

const SNAPSHOTS_PER_ACCOUNT = 2;

const PARTITIONED_NEWEST_FIRST =
    /row_number\(\) over \(partition by (?:"\w+"\.)?"account_id" order by (?:"\w+"\.)?"as_of" desc, (?:"\w+"\.)?"created_at" desc, (?:"\w+"\.)?"id" desc\)/;

function camelCased(column: string): string {
    return column.replaceAll(/_(\w)/g, (_, letter: string) =>
        letter.toUpperCase(),
    );
}

function onlyStatement(queries: readonly IssuedQuery[]): IssuedQuery {
    const [statement] = queries;
    if (statement === undefined) throw new Error('no statement was issued');
    return statement;
}

function parameterOf(query: IssuedQuery, pattern: RegExp): unknown {
    const match = pattern.exec(query.text);
    return match?.[1] ? query.params[Number(match[1]) - 1] : undefined;
}

function repoOver(rows: FakeRow[]) {
    const { database, queries } = createFakeDatabase((query) =>
        readTable(query) === TABLES.snapshot ? rows : [],
    );
    return { queries, repo: new PropAccountRepo(database, USER_ID) };
}

describe('PropAccountRepo.latestTwoSnapshots', () => {
    it('decodes the rows the database hands back as plain snapshot rows, without the rank column (the fake database does not rank)', async () => {
        const newest = snapshotRow({
            as_of: '2026-09-21',
            id: '99999999-9999-4999-8999-999999999990',
        });
        const previous = snapshotRow({ as_of: '2026-09-20' });
        const { repo } = repoOver([newest, previous]);
        const rows = await repo.latestTwoSnapshots();
        expect(rows.map((row) => row.asOf)).toEqual([
            '2026-09-21',
            '2026-09-20',
        ]);
        expect(rows.map((row) => row.accountId)).toEqual([
            IDS.account,
            IDS.account,
        ]);
        expect(Object.keys(rows[0] ?? {}).toSorted(compareText)).toEqual(
            Object.keys(snapshotRow()).map(camelCased).toSorted(compareText),
        );
    });

    it('pins the SQL text: ranks each account newest first by as_of, created_at, then id and keeps rank two or lower (not executed)', async () => {
        const { queries, repo } = repoOver([snapshotRow()]);
        await repo.latestTwoSnapshots();
        const statement = onlyStatement(queries);
        expect(statement.text).toMatch(PARTITIONED_NEWEST_FIRST);
        expect(parameterOf(statement, /"snapshot_rank" <= \$(\d+)/)).toBe(
            SNAPSHOTS_PER_ACCOUNT,
        );
        expect(statement.text).not.toMatch(/distinct on/i);
    });

    it('pins the SQL text: the user id filter sits inside the ranked subquery, with no OR (not executed)', async () => {
        const { queries, repo } = repoOver([snapshotRow()]);
        await repo.latestTwoSnapshots();
        const statement = onlyStatement(queries);
        assertUserScopedWhere(statement, USER_ID);
        const owners = statement.text
            .matchAll(/"user_id" = \$(\d+)/g)
            .map((match) => statement.params[Number(match[1]) - 1])
            .toArray();
        expect(owners).toEqual([USER_ID]);
        expect(statement.text.indexOf('"user_id" = $')).toBeLessThan(
            statement.text.indexOf('"snapshot_rank" <='),
        );
        expect(statement.text).not.toMatch(/\sor\s/i);
    });

    it('bounds the result to two rows per account of the account cap and fails loud past it (the fake database returns whatever rows it is given)', async () => {
        const limit =
            PROP_QUOTA_LIMITS[PropQuota.Accounts] * SNAPSHOTS_PER_ACCOUNT;
        const within = repoOver(
            Array.from({ length: limit }, () => snapshotRow()),
        );
        await expect(within.repo.latestTwoSnapshots()).resolves.toHaveLength(
            limit,
        );
        expect(
            parameterOf(onlyStatement(within.queries), / limit \$(\d+)$/),
        ).toBe(limit + 1);
        const past = repoOver(
            Array.from({ length: limit + 1 }, () => snapshotRow()),
        );
        await expect(past.repo.latestTwoSnapshots()).rejects.toThrow(
            new PropListTooLargeError(PropRecord.Snapshot, limit),
        );
    });
});
