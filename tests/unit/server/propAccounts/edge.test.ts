import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import {
    COUNTED_OUTCOMES,
    EdgeDrift,
    MAX_EDGE_TRADES,
} from '~/lib/prop-accounts/edge';
import {
    PROP_MUTATION_WINDOW_MS,
    PROP_MUTATIONS_PER_WINDOW,
} from '~/lib/prop-accounts/server';
import { EvalSizingMode } from '~/lib/prop-calculator/advisor';
import { PLAN_TIMEZONE } from '~/lib/trading/defaults';
import { PropRouterBucket } from '~/server/api/routers/propAccounts/mutationGuard';

import {
    assertUserScopedWhere,
    type FakeRow,
    type IssuedQuery,
    readTable,
    writeTable,
} from '../fakeDatabase';
import {
    ANONYMOUS,
    callerFor,
    defined,
    errorShapeOf,
    rejectionOf,
    rulebookRow,
    SIGNED_IN,
    tableResponder,
    TABLES,
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

const TRADE_TABLE = 'sadranl_trade_assessment';
const EDGE_ROUTER_FILE = path.resolve(
    import.meta.dirname,
    '../../../../src/server/api/routers/propAccounts/edge.ts',
);

const rateLimit = vi.mocked(isWithinRateLimit);

beforeEach(() => {
    rateLimit.mockClear();
    rateLimit.mockImplementation(() => Promise.resolve(true));
});

function tradeQuery(queries: readonly IssuedQuery[]): IssuedQuery {
    return defined(queries.find((query) => readTable(query) === TRADE_TABLE));
}

function tradeRow(overrides: FakeRow = {}): FakeRow {
    return {
        created_at: new Date('2026-09-02T14:30:00Z'),
        grade: 'A',
        id: crypto.randomUUID(),
        outcome: 'win',
        outcome_r: 2,
        plan_id: null,
        score: 90,
        user_id: USER_ID,
        ...overrides,
    };
}

function trades(wins: number, losses: number): FakeRow[] {
    return [
        ...Array.from({ length: wins }, () => tradeRow()),
        ...Array.from({ length: losses }, () =>
            tradeRow({ outcome: 'loss', outcome_r: -1 }),
        ),
    ];
}

describe('propAccounts.edge.summary', () => {
    it('rejects an anonymous caller as UNAUTHORIZED before any read or rate limit', async () => {
        const { caller, queries } = callerFor(ANONYMOUS, tableResponder());
        await expect(caller.edge.summary({})).rejects.toMatchObject({
            code: 'UNAUTHORIZED',
        });
        expect(queries).toHaveLength(0);
        expect(rateLimit).not.toHaveBeenCalled();
    });

    it('scopes the journal read and the rulebook read by the session user', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TRADE_TABLE]: trades(2, 3) }),
        );
        await caller.edge.summary({});
        assertUserScopedWhere(tradeQuery(queries), USER_ID);
        const rulebookRead = defined(
            queries.find((query) => readTable(query) === TABLES.rulebook),
        );
        assertUserScopedWhere(rulebookRead, USER_ID);
    });

    it('rate limits each user in its own edge bucket', async () => {
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await caller.edge.summary({});
        expect(rateLimit).toHaveBeenCalledWith({
            bucket: `prop-accounts:${PropRouterBucket.Edge}`,
            key: USER_ID,
            max: PROP_MUTATIONS_PER_WINDOW,
            windowMs: PROP_MUTATION_WINDOW_MS,
        });
    });

    it('answers TOO_MANY_REQUESTS without reading the journal once the limit is hit', async () => {
        rateLimit.mockImplementation(() => Promise.resolve(false));
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const shape = errorShapeOf(await rejectionOf(caller.edge.summary({})));
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.message).toBe(
            'Too many requests in a short time; wait a minute and try again',
        );
        expect(queries).toHaveLength(0);
    });

    it('goes through the one bucketed prop rate limiter, not a limiter of its own', () => {
        expect(PropRouterBucket.Edge).toBe('edge');
        const source = readFileSync(EDGE_ROUTER_FILE, 'utf8');
        expect(source).not.toMatch(/isWithinRateLimit/);
        expect(source).not.toMatch(/['"`]prop-accounts:/);
        expect(source).toMatch(/PropRouterBucket\.Edge/);
    });

    it("summarizes the journal against the default rulebook's 40% and 1:2", async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.rulebook]: [],
                [TRADE_TABLE]: trades(10, 10),
            }),
        );
        const report = await caller.edge.summary({});
        expect(report.truncated).toBe(false);
        expect(report.summary.sampleSize).toBe(20);
        expect(report.summary.rewardToRisk).toBe(2);
        expect(report.summary.winRate).toMatchObject({
            assumed: 0.4,
            drift: EdgeDrift.WithinNoise,
            observed: 0.5,
        });
        expect(report.summary.expectancyR.assumed).toBeCloseTo(0.2, 12);
        expect(report.summary.expectancyR.observed).toBeCloseTo(0.5, 12);
    });

    it("compares against the user's own rulebook when one is stored", async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.rulebook]: [
                    rulebookRow({
                        parameters: { strategy: { rr: 3, winrate: 0.3 } },
                    }),
                ],
                [TRADE_TABLE]: trades(3, 7),
            }),
        );
        const { summary } = await caller.edge.summary({});
        expect(summary.winRate.assumed).toBe(0.3);
        expect(summary.rewardToRisk).toBe(3);
        expect(summary.expectancyR.assumed).toBeCloseTo(0.2, 12);
    });

    it('fails loud on a stored rulebook that cannot be read', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.rulebook]: [
                    rulebookRow({
                        parameters: {
                            eval: {
                                maxRiskDailyCapMultiple: 2,
                                mode: EvalSizingMode.MaxRisk,
                            },
                            strategy: { rr: 3 },
                        },
                    }),
                ],
            }),
        );
        const shape = errorShapeOf(await rejectionOf(caller.edge.summary({})));
        expect(shape.data.code).toBe('PRECONDITION_FAILED');
    });

    it('only reads: no insert, update or delete reaches the database', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TRADE_TABLE]: trades(4, 6) }),
        );
        await caller.edge.summary({ from: '2026-09-01', to: '2026-09-30' });
        expect(queries.length).toBeGreaterThan(0);
        expect(queries.filter((query) => writeTable(query) !== null)).toEqual(
            [],
        );
    });

    it('filters on the journal day in the trading plan time zone', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.edge.summary({ from: '2026-09-01', to: '2026-09-30' });
        const read = tradeQuery(queries);
        expect(read.text).toMatch(/at time zone \$\d+\)::date >= \$\d+/);
        expect(read.text).toMatch(/at time zone \$\d+\)::date <= \$\d+/);
        expect(read.params).toEqual(
            expect.arrayContaining([PLAN_TIMEZONE, '2026-09-01', '2026-09-30']),
        );
    });

    it.each([
        [
            'a range that ends before it starts',
            { from: '2026-09-30', to: '2026-09-01' },
        ],
        ['a date that is not on the calendar', { from: '2026-02-30' }],
        ['a date outside the account years', { to: '1999-12-31' }],
    ])('rejects %s before touching the database', async (_name, input) => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const shape = errorShapeOf(
            await rejectionOf(caller.edge.summary(input)),
        );
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(queries).toHaveLength(0);
    });

    it('keeps only counted trades with an R result in SQL, so the bound never spends a slot on a skipped trade', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.edge.summary({});
        const read = tradeQuery(queries);
        const where = /\swhere\s(.*)\sorder by\s/is.exec(read.text)?.[1] ?? '';
        const outcomeList = /"outcome" in \(((?:\$\d+(?:, )?)+)\)/.exec(where);
        expect(outcomeList, read.text).not.toBeNull();
        const listed = (outcomeList?.[1] ?? '')
            .matchAll(/\$(\d+)/g)
            .map((match) => read.params[Number(match[1]) - 1])
            .toArray();
        expect(new Set(listed)).toEqual(new Set(COUNTED_OUTCOMES));
        expect(listed).not.toContain('no-trade');
        expect(where).toMatch(/"outcome_r" is not null/);
        expect(where).not.toMatch(/"outcome" is not null/);
    });

    it('bounds the journal read and says when it counted only the latest trades', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TRADE_TABLE]: trades(MAX_EDGE_TRADES + 1, 0),
            }),
        );
        const report = await caller.edge.summary({});
        const read = tradeQuery(queries);
        expect(read.text).toMatch(/order by .*"created_at" desc limit \$\d+$/);
        expect(read.params.at(-1)).toBe(MAX_EDGE_TRADES + 1);
        expect(report.truncated).toBe(true);
        expect(report.summary.sampleSize).toBe(MAX_EDGE_TRADES);
    });
});
