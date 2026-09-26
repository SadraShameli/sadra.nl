import { describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import {
    FirmEngagementReason,
    FirmEngagementStatus,
} from '~/lib/prop-accounts';
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
    emptyReadsOf,
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
import {
    firmEngagementRow,
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

const PAUSE_MFFU = {
    firmId: FirmId.Mffu,
    reason: FirmEngagementReason.RulesChanged,
    sinceOn: '2026-09-22',
    status: FirmEngagementStatus.Paused,
};

const MFFU_STATUS = firmEngagementRow({
    external_firm_id: null,
    firm_id: FirmId.Mffu,
    reason: null,
    sent_live_on: null,
    status: FirmEngagementStatus.Active,
});

describe('propAccounts.firmEngagement', () => {
    it('set inserts a first status for a listed firm after the quota check, in one transaction', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            emptyReadsOf([VIDEO_TABLES.firmEngagement]),
        );
        await caller.firmEngagement.set(PAUSE_MFFU);
        const count = queries.find((query) => isCount(query));
        expect(readTable(defined(count))).toBe(VIDEO_TABLES.firmEngagement);
        assertUserScopedWhere(defined(count), USER_ID);
        const [insert] = insertsInto(queries, VIDEO_TABLES.firmEngagement);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(insert), 'firm_id')).toEqual([
            FirmId.Mffu,
        ]);
        expect(insertedColumnValues(defined(insert), 'status')).toEqual([
            FirmEngagementStatus.Paused,
        ]);
        expect(updatesOf(queries, VIDEO_TABLES.firmEngagement)).toHaveLength(0);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('set updates the status the firm already has, by id and user id, instead of inserting a second one', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.firmEngagement]: [MFFU_STATUS] }),
        );
        await caller.firmEngagement.set(PAUSE_MFFU);
        const reads = queries.filter(
            (query) =>
                readTable(query) === VIDEO_TABLES.firmEngagement &&
                !isCount(query),
        );
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) assertUserScopedWhere(read, USER_ID);
        expect(insertsInto(queries, VIDEO_TABLES.firmEngagement)).toHaveLength(
            0,
        );
        const [update] = updatesOf(queries, VIDEO_TABLES.firmEngagement);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                FirmEngagementStatus.Paused,
                FirmEngagementReason.RulesChanged,
                '2026-09-22',
                VIDEO_IDS.firmEngagement,
            ]),
        );
    });

    it('set keys the upsert by firm: a status for another firm does not stop a new one', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.firmEngagement.set(PAUSE_MFFU);
        expect(insertsInto(queries, VIDEO_TABLES.firmEngagement)).toHaveLength(
            1,
        );
        expect(updatesOf(queries, VIDEO_TABLES.firmEngagement)).toHaveLength(0);
    });

    it('set on one of the caller own firms reads that firm scoped by user and updates its existing status', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.firmEngagement.set({
            externalFirmId: VIDEO_IDS.externalFirm,
            reason: FirmEngagementReason.SentLive,
            sentLiveOn: '2026-09-20',
            sinceOn: '2026-09-21',
            status: FirmEngagementStatus.Retired,
        });
        const firmLoad = queries.find(
            (query) => readTable(query) === VIDEO_TABLES.externalFirm,
        );
        assertUserScopedWhere(defined(firmLoad), USER_ID);
        expect(firmLoad?.params).toContain(VIDEO_IDS.externalFirm);
        expect(updatesOf(queries, VIDEO_TABLES.firmEngagement)).toHaveLength(1);
    });

    it('set with another user firm is rejected with a typed reason and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.externalFirm]: [] }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.firmEngagement.set({
                    externalFirmId: VIDEO_IDS.externalFirm,
                    sinceOn: '2026-09-21',
                    status: FirmEngagementStatus.Active,
                }),
            ),
        );
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ReferenceNotOwned),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('set rejects a paused firm without a reason before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.firmEngagement.set({ ...PAUSE_MFFU, reason: null }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('set fails loud at the firm status quota when it would add a row, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            emptyReadsOf(
                [VIDEO_TABLES.firmEngagement],
                tableResponder(
                    {},
                    {
                        [VIDEO_TABLES.firmEngagement]:
                            PROP_QUOTA_LIMITS[PropQuota.FirmEngagements],
                    },
                ),
            ),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.firmEngagement.set(PAUSE_MFFU)),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection).toMatchObject({
            quota: PropQuota.FirmEngagements,
            reason: PropLimitRejection.QuotaExceeded,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rate-limits changes in the firm status bucket per user', async () => {
        rateLimit.mockClear();
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await caller.firmEngagement.set(PAUSE_MFFU);
        expect(rateLimit).toHaveBeenCalledWith(
            expect.objectContaining({
                bucket: 'prop-accounts:firm-engagement',
                key: USER_ID,
            }),
        );
    });

    it('list returns the caller statuses from a scoped, bounded read', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const statuses = await caller.firmEngagement.list();
        expect(statuses).toHaveLength(1);
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.text).toMatch(/ limit \$\d+$/);
    });

    it('remove deletes the owned status by id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.firmEngagement.remove({ id: VIDEO_IDS.firmEngagement }),
        ).resolves.toEqual({ ok: true });
        const [removal] = deletesFrom(queries, VIDEO_TABLES.firmEngagement);
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(removal?.params).toContain(VIDEO_IDS.firmEngagement);
    });

    it('remove of another user status throws NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.firmEngagement]: [] }),
        );
        await expect(
            caller.firmEngagement.remove({ id: VIDEO_IDS.firmEngagement }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });
});
