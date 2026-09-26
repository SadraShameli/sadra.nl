import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import {
    PROP_MUTATION_WINDOW_MS,
    PROP_MUTATIONS_PER_WINDOW,
    PROP_QUOTA_LIMITS,
} from '~/lib/prop-accounts/server';
import { PropQuota } from '~/lib/schemas/propAccountOutputs';
import { MAX_SCENARIO_QUERY_LENGTH } from '~/lib/schemas/propAccounts';

import {
    assertUserScopedWhere,
    type FakeRow,
    insertedColumnValues,
    type IssuedQuery,
    readTable,
    writeTable,
} from '../fakeDatabase';
import {
    callerFor,
    defined,
    deletesFrom,
    errorShapeOf,
    IDS,
    insertsInto,
    isCount,
    propWrites,
    rejectionOf,
    type Responder,
    scenarioRow,
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

const NEW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const rateLimit = vi.mocked(isWithinRateLimit);

beforeEach(() => {
    rateLimit.mockClear();
    rateLimit.mockImplementation(() => Promise.resolve(true));
});

function importResponder(
    stored: readonly FakeRow[],
    inserted: readonly FakeRow[],
    storedCount = 0,
): Responder {
    const base = tableResponder({}, { [TABLES.scenario]: storedCount });
    return (query: IssuedQuery) => {
        if (writeTable(query) === TABLES.scenario) return [...inserted];
        return readTable(query) === TABLES.scenario && !isCount(query) ? [...stored] : base(query);
    };
}

function namesOf(rows: readonly { name: string }[]): string[] {
    return rows.map((row) => row.name);
}

describe('propAccounts.scenario', () => {
    it('save rejects a query over 8,192 characters before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.scenario.save({
                name: 'Too long',
                query: 'a'.repeat(MAX_SCENARIO_QUERY_LENGTH + 1),
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('save of a new name checks the quota, then upserts for the session user', async () => {
        const base = tableResponder();
        const { caller, queries } = callerFor(SIGNED_IN, (query) =>
            readTable(query) === TABLES.scenario && !isCount(query)
                ? []
                : base(query),
        );
        await caller.scenario.save({ name: 'New', query: 'firm=mffu' });
        expect(queries.some(isCount)).toBe(true);
        const [insert] = insertsInto(queries, TABLES.scenario);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insert?.text).toMatch(
            /on conflict \("user_id","name"\) do update set/,
        );
        assertUserScopedWhere(defined(insert), USER_ID);
    });

    it('save over an existing name skips the quota check', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const saved = await caller.scenario.save({
            name: 'Scenario one',
            query: 'firm=mffu',
        });
        expect(saved.name).toBe('Scenario one');
        expect(queries.some(isCount)).toBe(false);
    });

    it('list is scoped, ordered by name and bounded', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.scenario.list();
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.text).toMatch(/order by (?:"\w+"\.)?"name"/);
        expect(list?.text).toMatch(/ limit \$\d+$/);
    });

    it('remove deletes the owned scenario by id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.scenario.remove({ id: IDS.scenario });
        const [removal] = deletesFrom(queries, TABLES.scenario);
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(removal?.params).toContain(IDS.scenario);
    });

    it('importMany inserts only: a stored name is skipped and never overwritten', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            importResponder(
                [scenarioRow()],
                [scenarioRow({ id: NEW_ID, name: 'New', query: 'firm=apex' })],
            ),
        );
        const result = await caller.scenario.importMany([
            { name: 'Scenario one', query: 'firm=topstep' },
            { name: 'New', query: 'firm=apex' },
        ]);
        const inserts = insertsInto(queries, TABLES.scenario);
        expect(inserts).toHaveLength(1);
        const [insert] = inserts;
        expect(insert?.text).toMatch(
            /on conflict \("user_id","name"\) do nothing/,
        );
        expect(insert?.text).not.toMatch(/do update/);
        expect(insertedColumnValues(defined(insert), 'name')).toEqual(['New']);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(namesOf(result.imported)).toEqual(['New']);
        expect(result.skippedNames).toEqual(['Scenario one']);
        expect(
            queries.filter((query) =>
                query.text.startsWith(`update "${TABLES.scenario}"`),
            ),
        ).toHaveLength(0);
    });

    it('importMany looks up the stored names for the session user only', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            importResponder([], [scenarioRow({ id: NEW_ID, name: 'New' })]),
        );
        await caller.scenario.importMany([{ name: 'New', query: 'firm=apex' }]);
        const lookup = defined(
            queries.find(
                (query) =>
                    readTable(query) === TABLES.scenario && !isCount(query),
            ),
        );
        assertUserScopedWhere(lookup, USER_ID);
        expect(lookup.params).toContain('New');
    });

    it('importMany takes the per-user quota lock first in its transaction', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            importResponder([], [scenarioRow({ id: NEW_ID, name: 'New' })]),
        );
        await caller.scenario.importMany([{ name: 'New', query: 'firm=apex' }]);
        const [begin, lock] = queries;
        expect(begin?.text).toBe('begin');
        expect(lock?.text).toBe(
            'select pg_advisory_xact_lock(hashtextextended($1, 0))',
        );
        expect(lock?.params).toEqual([`prop-quota:${USER_ID}`]);
    });

    it('importMany counts only the new names against the saved scenario cap', async () => {
        const limit = PROP_QUOTA_LIMITS[PropQuota.Scenarios];
        const fits = callerFor(
            SIGNED_IN,
            importResponder(
                [scenarioRow()],
                [scenarioRow({ id: NEW_ID, name: 'New' })],
                limit - 1,
            ),
        );
        const result = await fits.caller.scenario.importMany([
            { name: 'Scenario one', query: 'firm=topstep' },
            { name: 'New', query: 'firm=apex' },
        ]);
        expect(namesOf(result.imported)).toEqual(['New']);

        const over = callerFor(
            SIGNED_IN,
            importResponder([], [], limit - 1),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                over.caller.scenario.importMany([
                    { name: 'New', query: 'firm=apex' },
                    { name: 'Newer', query: 'firm=lucid' },
                ]),
            ),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(propWrites(over.queries)).toHaveLength(0);
    });

    it('importMany writes nothing and reports every name when all are already stored', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            importResponder(
                [scenarioRow(), scenarioRow({ id: NEW_ID, name: 'Two' })],
                [],
            ),
        );
        const result = await caller.scenario.importMany([
            { name: 'Scenario one', query: 'firm=topstep' },
            { name: 'Two', query: 'firm=apex' },
        ]);
        expect(result).toEqual({
            imported: [],
            skippedNames: ['Scenario one', 'Two'],
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('importMany reports a name another device took between the lookup and the insert as skipped', async () => {
        const { caller } = callerFor(SIGNED_IN, importResponder([], []));
        const result = await caller.scenario.importMany([
            { name: 'New', query: 'firm=apex' },
        ]);
        expect(result).toEqual({ imported: [], skippedNames: ['New'] });
    });

    it.each([
        ['an empty batch', []],
        [
            'the same name twice',
            [
                { name: 'Twice', query: 'firm=apex' },
                { name: 'Twice', query: 'firm=lucid' },
            ],
        ],
        [
            'more scenarios than the saved scenario cap',
            Array.from(
                { length: PROP_QUOTA_LIMITS[PropQuota.Scenarios] + 1 },
                (_, index) => ({
                    name: `Scenario ${String(index)}`,
                    query: 'firm=apex',
                }),
            ),
        ],
        [
            'a query over 8,192 characters',
            [
                {
                    name: 'Too long',
                    query: 'a'.repeat(MAX_SCENARIO_QUERY_LENGTH + 1),
                },
            ],
        ],
    ])(
        'importMany rejects %s before touching the database',
        async (_name, input) => {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            const shape = errorShapeOf(
                await rejectionOf(caller.scenario.importMany(input)),
            );
            expect(shape.data.code).toBe('BAD_REQUEST');
            expect(queries).toHaveLength(0);
        },
    );

    it('removeAll deletes every scenario of the session user in one scoped statement', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.scenario]: [
                    scenarioRow(),
                    scenarioRow({ id: NEW_ID, name: 'Two' }),
                ],
            }),
        );
        const result = await caller.scenario.removeAll();
        expect(result).toEqual({ removed: 2 });
        const removals = deletesFrom(queries, TABLES.scenario);
        expect(removals).toHaveLength(1);
        const [removal] = removals;
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(removal?.text).toMatch(
            /^delete from "sadranl_prop_saved_scenario" where "sadranl_prop_saved_scenario"."user_id" = \$1 returning/,
        );
        expect(removal?.params).toEqual([USER_ID]);
        expect(propWrites(queries)).toHaveLength(1);
    });

    it('removeAll counts the rate limit in the scenario bucket and deletes nothing once it is hit', async () => {
        const allowed = callerFor(SIGNED_IN, tableResponder());
        await allowed.caller.scenario.removeAll();
        expect(rateLimit).toHaveBeenCalledWith({
            bucket: 'prop-accounts:scenario',
            key: USER_ID,
            max: PROP_MUTATIONS_PER_WINDOW,
            windowMs: PROP_MUTATION_WINDOW_MS,
        });

        rateLimit.mockImplementation(() => Promise.resolve(false));
        const limited = callerFor(SIGNED_IN, tableResponder());
        const shape = errorShapeOf(
            await rejectionOf(limited.caller.scenario.removeAll()),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(limited.queries).toHaveLength(0);
    });
});
