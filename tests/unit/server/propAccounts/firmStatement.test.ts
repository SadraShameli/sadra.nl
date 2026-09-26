import { describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import { ReportedPayoutBasis } from '~/lib/prop-accounts';
import { PROP_QUOTA_LIMITS } from '~/lib/prop-accounts/server';
import { FirmId } from '~/lib/prop-calculator';
import {
    PropLimitRejection,
    PropMutationRejection,
    PropQuota,
} from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    insertedColumnValues,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    callerFor,
    defined,
    deletesFrom,
    errorShapeOf,
    insertsInto,
    isCount,
    mutationRejection,
    propWrites,
    rejectionOf,
    SIGNED_IN,
    tableResponder,
    updatesOf,
    USER_ID,
} from './propRouterHarness';
import { VIDEO_IDS, VIDEO_TABLES } from './videoRecordFixtures';

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

const MFFU_STATEMENT = {
    asOf: '2026-09-21',
    basis: ReportedPayoutBasis.Gross,
    firmId: FirmId.Mffu,
    reportedPayoutCents: 1_250_000,
};

const STATEMENT_UPDATE = {
    asOf: '2026-09-22',
    basis: ReportedPayoutBasis.Net,
    id: VIDEO_IDS.firmStatement,
    note: 'Dashboard shows net',
    reportedPayoutCents: 1_125_000,
};

describe('propAccounts.firmStatement', () => {
    it('create inserts the statement for the session user after the quota check, in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.firmStatement.create(MFFU_STATEMENT);
        const count = queries.find((query) => isCount(query));
        expect(readTable(defined(count))).toBe(VIDEO_TABLES.firmStatement);
        assertUserScopedWhere(defined(count), USER_ID);
        const [insert] = insertsInto(queries, VIDEO_TABLES.firmStatement);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(
            insertedColumnValues(defined(insert), 'reported_payout_cents'),
        ).toEqual([1_250_000]);
        expect(insertedColumnValues(defined(insert), 'basis')).toEqual([
            ReportedPayoutBasis.Gross,
        ]);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('create for one of the caller own firms reads that firm scoped by user', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.firmStatement.create({
            ...MFFU_STATEMENT,
            externalFirmId: VIDEO_IDS.externalFirm,
            firmId: null,
        });
        const firmLoad = queries.find(
            (query) => readTable(query) === VIDEO_TABLES.externalFirm,
        );
        assertUserScopedWhere(defined(firmLoad), USER_ID);
        expect(firmLoad?.params).toContain(VIDEO_IDS.externalFirm);
    });

    it('create for another user firm is rejected with a typed reason and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.externalFirm]: [] }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.firmStatement.create({
                    ...MFFU_STATEMENT,
                    externalFirmId: VIDEO_IDS.externalFirm,
                    firmId: null,
                }),
            ),
        );
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ReferenceNotOwned),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create without a firm is rejected before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.firmStatement.create({ ...MFFU_STATEMENT, firmId: null }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('create fails loud at the firm statement quota and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder(
                {},
                {
                    [VIDEO_TABLES.firmStatement]:
                        PROP_QUOTA_LIMITS[PropQuota.FirmStatements],
                },
            ),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.firmStatement.create(MFFU_STATEMENT)),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection).toMatchObject({
            quota: PropQuota.FirmStatements,
            reason: PropLimitRejection.QuotaExceeded,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rate-limits changes in the firm statement bucket per user', async () => {
        rateLimit.mockClear();
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await caller.firmStatement.create(MFFU_STATEMENT);
        expect(rateLimit).toHaveBeenCalledWith(
            expect.objectContaining({
                bucket: 'prop-accounts:firm-statement',
                key: USER_ID,
            }),
        );
    });

    it('list returns the caller statements from a scoped, bounded read', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const statements = await caller.firmStatement.list();
        expect(statements.map((row) => row.reportedPayoutCents)).toEqual([
            1_250_000,
        ]);
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.text).toMatch(/ limit \$\d+$/);
    });

    it('update and remove load the owned statement first and write with id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.firmStatement.update(STATEMENT_UPDATE);
        await caller.firmStatement.remove({ id: VIDEO_IDS.firmStatement });
        const [update] = updatesOf(queries, VIDEO_TABLES.firmStatement);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                '2026-09-22',
                ReportedPayoutBasis.Net,
                'Dashboard shows net',
                1_125_000,
            ]),
        );
        const [removal] = deletesFrom(queries, VIDEO_TABLES.firmStatement);
        for (const write of [update, removal]) {
            assertUserScopedWhere(defined(write), USER_ID);
            expect(write?.params).toContain(VIDEO_IDS.firmStatement);
        }
        expect(propWrites(queries)).toHaveLength(2);
    });

    it('update and remove of another user statement throw NOT_FOUND and write nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.firmStatement]: [] }),
        );
        await expect(
            caller.firmStatement.update(STATEMENT_UPDATE),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
            caller.firmStatement.remove({ id: VIDEO_IDS.firmStatement }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });
});
