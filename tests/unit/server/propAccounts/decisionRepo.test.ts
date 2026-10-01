import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

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
import { decisionRow, IDS, TABLES, USER_ID } from './propRouterHarness';

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

const DECISION_ROUTER_PATH = new URL(
    '../../../../src/server/api/routers/propAccounts/decision.ts',
    import.meta.url,
);

function limitParameter(query: IssuedQuery | undefined): unknown {
    const match = / limit \$(\d+)$/.exec(query?.text ?? '');
    return match?.[1] ? query?.params[Number(match[1]) - 1] : undefined;
}

function onlyStatement(queries: readonly IssuedQuery[]): IssuedQuery {
    const [statement] = queries;
    if (statement === undefined) throw new Error('no statement was issued');
    return statement;
}

function repoOver(rows: FakeRow[]) {
    const { database, queries } = createFakeDatabase((query) =>
        readTable(query) === TABLES.decision ? rows : [],
    );
    return { queries, repo: new PropAccountRepo(database, USER_ID) };
}

describe('PropAccountRepo.listDecisions', () => {
    it('lists every decision of the caller, newest first, scoped by user id alone', async () => {
        const { queries, repo } = repoOver([decisionRow()]);
        const rows = await repo.listDecisions();
        expect(rows).toHaveLength(1);
        const statement = onlyStatement(queries);
        assertUserScopedWhere(statement, USER_ID);
        expect(readTable(statement)).toBe(TABLES.decision);
        expect(statement.text).not.toMatch(/"account_id" = /);
        expect(statement.text).toMatch(
            /order by "\w+"\."decided_on" desc, "\w+"\."created_at" desc, "\w+"\."id" desc/,
        );
    });

    it('narrows to one account on top of the user scope', async () => {
        const { queries, repo } = repoOver([decisionRow()]);
        await repo.listDecisions(IDS.account);
        const statement = onlyStatement(queries);
        assertUserScopedWhere(statement, USER_ID);
        expect(statement.text).toMatch(/"account_id" = \$\d+/);
        expect(statement.params).toContain(IDS.account);
    });

    it('fails loud past the decision cap instead of dropping rows, with and without an account', async () => {
        const limit = PROP_QUOTA_LIMITS[PropQuota.Decisions];
        for (const accountId of [undefined, IDS.account]) {
            const { queries, repo } = repoOver(
                Array.from({ length: limit + 1 }, () => decisionRow()),
            );
            await expect(repo.listDecisions(accountId)).rejects.toThrow(
                new PropListTooLargeError(PropRecord.Decision, limit),
            );
            expect(limitParameter(queries[0])).toBe(limit + 1);
        }
    });
});

describe('propAccounts decision router', () => {
    it('keeps no decision query of its own: every read goes through the repository', () => {
        const source = readFileSync(DECISION_ROUTER_PATH, 'utf8');
        expect(source).not.toMatch(/\.select\(/);
        expect(source).not.toContain('PropListTooLargeError');
        expect(source).not.toContain('listDecisionsForAccount');
    });
});
