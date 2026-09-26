import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAN } from '~/lib/trading/defaults';
import { loadActiveTradingPlan } from '~/lib/trading/loadActiveTradingPlan';

import {
    assertUserScopedWhere,
    type FakeRow,
    type IssuedQuery,
    readTable,
} from '../../server/fakeDatabase';

const USER_ID = 'user-active-plan';

const fake = vi.hoisted(() => ({
    queries: [] as IssuedQuery[],
    rows: [] as Record<string, unknown>[],
}));

vi.mock('~/server/db', async () => {
    const { createFakeDatabase } = await import('../../server/fakeDatabase');
    const { tradingPlans } = await import('~/server/db/schemas/trading');
    const { database, queries } = createFakeDatabase(() => fake.rows);
    fake.queries = queries;
    return { db: database, tradingPlans };
});

function onlyQuery(): IssuedQuery {
    expect(fake.queries).toHaveLength(1);
    const [query] = fake.queries;
    if (query === undefined) throw new Error('no query issued');
    return query;
}

function planRow(overrides: Partial<FakeRow> = {}): FakeRow {
    return {
        config: DEFAULT_PLAN,
        created_at: '2026-09-01T08:00:00.000Z',
        id: '00000000-0000-4000-8000-000000000001',
        is_active: true,
        name: 'My trading plan',
        sort_order: 0,
        updated_at: '2026-09-20T08:00:00.000Z',
        user_id: USER_ID,
        ...overrides,
    };
}

describe('loadActiveTradingPlan', () => {
    beforeEach(() => {
        fake.queries.length = 0;
        fake.rows = [];
    });

    it('reads one trading plan row scoped to the user', async () => {
        fake.rows = [planRow()];
        await loadActiveTradingPlan(USER_ID);
        const query = onlyQuery();
        expect(readTable(query)).toMatch(/trading_plan$/);
        assertUserScopedWhere(query, USER_ID);
        expect(query.text).toMatch(/\slimit \$\d+$/);
        expect(query.params.at(-1)).toBe(1);
    });

    it('prefers the active plan, then the plan list order the profile and checklist use', async () => {
        await loadActiveTradingPlan(USER_ID);
        expect(onlyQuery().text).toMatch(
            /order by (?:"\w+"\.)?"is_active" desc, (?:"\w+"\.)?"sort_order"(?: asc)?, (?:"\w+"\.)?"updated_at" desc/,
        );
    });

    it('returns the stored row with its config untouched', async () => {
        fake.rows = [planRow({ name: 'Scalping' })];
        const plan = await loadActiveTradingPlan(USER_ID);
        expect(plan).toMatchObject({
            config: DEFAULT_PLAN,
            isActive: true,
            name: 'Scalping',
            sortOrder: 0,
            userId: USER_ID,
        });
    });

    it('returns undefined when the user has no trading plan', async () => {
        await expect(loadActiveTradingPlan(USER_ID)).resolves.toBeUndefined();
    });

    it('is a server-only module', () => {
        const source = readFileSync(
            new URL(
                '../../../../src/lib/trading/loadActiveTradingPlan.ts',
                import.meta.url,
            ),
            'utf8',
        );
        expect(source).toContain("import 'server-only';");
    });
});
