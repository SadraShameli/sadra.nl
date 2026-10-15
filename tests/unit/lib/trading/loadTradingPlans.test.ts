import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PLAN } from '~/lib/trading/defaults';
import { loadTradingPlans } from '~/lib/trading/loadTradingPlans';

import {
    assertUserScopedWhere,
    type FakeRow,
    type IssuedQuery,
    readTable,
} from '../../server/fakeDatabase';

const USER_ID = 'user-plan-list';

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

describe('loadTradingPlans', () => {
    beforeEach(() => {
        fake.queries.length = 0;
        fake.rows = [];
    });

    it("issues one read of the user's trading plans and no write", async () => {
        await loadTradingPlans(USER_ID);
        expect(fake.queries).toHaveLength(1);
        const [query] = fake.queries;
        if (query === undefined) throw new Error('no query issued');
        expect(readTable(query)).toMatch(/trading_plan$/);
        assertUserScopedWhere(query, USER_ID);
    });

    it('orders plans by the list order, newest edit first on ties', async () => {
        await loadTradingPlans(USER_ID);
        expect(fake.queries[0]?.text).toMatch(
            /order by (?:"\w+"\.)?"sort_order"(?: asc)?, (?:"\w+"\.)?"updated_at" desc$/,
        );
    });

    it('returns every stored row', async () => {
        fake.rows = [
            planRow(),
            planRow({
                id: '00000000-0000-4000-8000-000000000002',
                is_active: false,
                name: 'Scalping',
                sort_order: 1,
            }),
        ];
        const plans = await loadTradingPlans(USER_ID);
        expect(plans.map((plan) => plan.name)).toEqual([
            'My trading plan',
            'Scalping',
        ]);
    });

    it('returns an empty list when the user has no plan yet', async () => {
        await expect(loadTradingPlans(USER_ID)).resolves.toEqual([]);
    });

    it('is a server-only module', () => {
        const source = readFileSync(
            new URL(
                '../../../../src/lib/trading/loadTradingPlans.ts',
                import.meta.url,
            ),
            'utf8',
        );
        expect(source).toContain("import 'server-only';");
    });
});
