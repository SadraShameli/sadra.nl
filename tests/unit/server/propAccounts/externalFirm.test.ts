import { describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import { PROP_QUOTA_LIMITS } from '~/lib/prop-accounts/server';
import {
    PropLimitRejection,
    PropMutationRejection,
    PropQuota,
} from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    FakeDatabaseError,
    insertedColumnValues,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    accountRow,
    callerFor,
    defined,
    deletesFrom,
    errorShapeOf,
    failingWrite,
    insertsInto,
    isCount,
    mutationRejection,
    propWrites,
    rejectionOf,
    SIGNED_IN,
    tableResponder,
    TABLES,
    updatesOf,
    USER_ID,
} from './propRouterHarness';
import {
    externalFirmRow,
    roundRow,
    VIDEO_IDS,
    VIDEO_TABLES,
} from './videoRecordFixtures';

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

const rateLimit = vi.mocked(isWithinRateLimit);

const NOTHING_REFERENCES_IT = {
    [TABLES.account]: [],
    [VIDEO_TABLES.firmEngagement]: [],
    [VIDEO_TABLES.firmStatement]: [],
    [VIDEO_TABLES.round]: [],
};

describe('propAccounts.externalFirm', () => {
    it('create inserts the firm for the session user after the quota check, in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const created = await caller.externalFirm.create({
            name: 'Hola Prime',
        });
        expect(created.name).toBe('Hola Prime');
        const count = queries.find((query) => isCount(query));
        expect(readTable(defined(count))).toBe(VIDEO_TABLES.externalFirm);
        assertUserScopedWhere(defined(count), USER_ID);
        const [insert] = insertsInto(queries, VIDEO_TABLES.externalFirm);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(insert), 'name')).toEqual([
            'Hola Prime',
        ]);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('create fails loud at the external firm quota and writes nothing', async () => {
        const limit = PROP_QUOTA_LIMITS[PropQuota.ExternalFirms];
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({}, { [VIDEO_TABLES.externalFirm]: limit }),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.externalFirm.create({ name: 'One more' })),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection).toEqual({
            lifecycleRejection: null,
            limit,
            quota: PropQuota.ExternalFirms,
            reason: PropLimitRejection.QuotaExceeded,
            record: null,
            recordId: null,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create maps a duplicate name to CONFLICT with a readable message', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            failingWrite(
                VIDEO_TABLES.externalFirm,
                new FakeDatabaseError(
                    '23505',
                    'prop_external_firm_user_name_idx',
                ),
            ),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.externalFirm.create({ name: 'hola prime' }),
            ),
        );
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.message).toBe('One of your firms already has this name');
    });

    it('rate-limits changes in the external firm bucket per user and writes nothing when limited', async () => {
        rateLimit.mockClear();
        rateLimit.mockResolvedValueOnce(false);
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.externalFirm.create({ name: 'Hola Prime' }),
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
        expect(rateLimit).toHaveBeenCalledWith(
            expect.objectContaining({
                bucket: 'prop-accounts:external-firm',
                key: USER_ID,
            }),
        );
        expect(queries).toHaveLength(0);
    });

    it('list returns the caller firms from a scoped, bounded read', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const firms = await caller.externalFirm.list();
        expect(firms.map((firm) => firm.name)).toEqual(['Hola Prime']);
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.text).toMatch(/ limit \$\d+$/);
    });

    it('update loads the owned firm and writes name and notes by id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.externalFirm.update({
            id: VIDEO_IDS.externalFirm,
            name: 'Hola Prime Futures',
            notes: 'Switched to futures',
        });
        const load = queries.find(
            (query) => readTable(query) === VIDEO_TABLES.externalFirm,
        );
        assertUserScopedWhere(defined(load), USER_ID);
        const [update] = updatesOf(queries, VIDEO_TABLES.externalFirm);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                'Hola Prime Futures',
                'Switched to futures',
                VIDEO_IDS.externalFirm,
            ]),
        );
    });

    it('update and remove of another user firm throw NOT_FOUND and write nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.externalFirm]: [] }),
        );
        await expect(
            caller.externalFirm.update({
                id: VIDEO_IDS.externalFirm,
                name: 'Renamed',
                notes: null,
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
            caller.externalFirm.remove({ id: VIDEO_IDS.externalFirm }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('remove deletes an unreferenced firm by id and user id after scoped reference checks', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder(NOTHING_REFERENCES_IT),
        );
        await expect(
            caller.externalFirm.remove({ id: VIDEO_IDS.externalFirm }),
        ).resolves.toEqual({ ok: true });
        const referenceTables = new Set<null | string>(
            Object.keys(NOTHING_REFERENCES_IT),
        );
        const referenceReads = queries.filter((query) =>
            referenceTables.has(readTable(query)),
        );
        expect(referenceReads).toHaveLength(4);
        for (const read of referenceReads) {
            assertUserScopedWhere(read, USER_ID);
            expect(read.params).toContain(VIDEO_IDS.externalFirm);
        }
        const [removal] = deletesFrom(queries, VIDEO_TABLES.externalFirm);
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(removal?.params).toContain(VIDEO_IDS.externalFirm);
    });

    it.each([
        {
            name: 'an account',
            rows: { [TABLES.account]: [accountRow()] },
        },
        {
            name: 'a round',
            rows: { [VIDEO_TABLES.round]: [roundRow()] },
        },
        {
            name: 'a firm status',
            rows: {
                [VIDEO_TABLES.firmEngagement]: [externalFirmRow()],
            },
        },
        {
            name: 'a firm statement',
            rows: {
                [VIDEO_TABLES.firmStatement]: [externalFirmRow()],
            },
        },
    ])(
        'remove refuses while $name still refers to the firm, with a typed reason, and deletes nothing',
        async ({ rows }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                tableResponder({ ...NOTHING_REFERENCES_IT, ...rows }),
            );
            const shape = errorShapeOf(
                await rejectionOf(
                    caller.externalFirm.remove({ id: VIDEO_IDS.externalFirm }),
                ),
            );
            expect(shape.data.code).toBe('CONFLICT');
            expect(shape.message).toContain('"Hola Prime"');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.RecordInUse),
            );
            expect(propWrites(queries)).toHaveLength(0);
        },
    );
});
