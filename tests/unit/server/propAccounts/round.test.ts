import { describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import {
    AccountEventKind,
    readAccountEventDetail,
    RoundStatus,
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
    accountRow,
    callerFor,
    defined,
    deletesFrom,
    errorShapeOf,
    feeRow,
    IDS,
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
import { roundRow, VIDEO_IDS, VIDEO_TABLES } from './videoRecordFixtures';

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

const ROUND_UPDATE = {
    budgetCents: 150_000,
    externalFirmId: null,
    firmId: FirmId.Mffu,
    id: VIDEO_IDS.round,
    label: 'September round',
    notes: 'Raised the budget',
    openedOn: '2026-09-01',
};

describe('propAccounts.round', () => {
    it('assign moves the caller account into an open round scoped by user, when it fits the budget', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 16_500 })],
            }),
        );
        await caller.round.assign({
            accountId: IDS.account,
            roundId: VIDEO_IDS.round,
        });
        const [update] = updatesOf(queries, TABLES.account);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.text).toMatch(/"round_id" = \$\d+/);
        expect(update?.params).toContain(VIDEO_IDS.round);
    });

    it('assign refuses a closed round and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [VIDEO_TABLES.round]: [
                    roundRow({ status: RoundStatus.Closed }),
                ],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.round.assign({
                    accountId: IDS.account,
                    roundId: VIDEO_IDS.round,
                }),
            ),
        );
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RoundClosed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('assign refuses a round whose budget is already spent, unless overridden', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 150_000 })],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.round.assign({
                    accountId: IDS.account,
                    roundId: VIDEO_IDS.round,
                }),
            ),
        );
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RoundBudgetExceeded),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const { caller: overrideCaller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 150_000 })],
            }),
        );
        await expect(
            overrideCaller.round.assign({
                accountId: IDS.account,
                overrideRoundBudget: true,
                roundId: VIDEO_IDS.round,
            }),
        ).resolves.toMatchObject({ id: IDS.account });
    });

    it('assign records an Edited event with the old and new round', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 16_500 })],
            }),
        );
        await caller.round.assign({
            accountId: IDS.account,
            roundId: VIDEO_IDS.round,
        });
        const [eventInsert] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(eventInsert), 'kind')).toEqual([
            AccountEventKind.Edited,
        ]);
        const [detail] = insertedColumnValues(
            defined(eventInsert),
            'detail',
        ).map((raw) =>
            readAccountEventDetail(
                typeof raw === 'string' ? JSON.parse(raw) : raw,
            ),
        );
        expect(detail?.changes).toEqual([
            { field: 'roundId', from: null, to: VIDEO_IDS.round },
        ]);
    });

    it('assign writes no Edited event when the round does not change', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ round_id: VIDEO_IDS.round })],
                [TABLES.fee]: [feeRow({ amount_cents: 16_500 })],
            }),
        );
        await caller.round.assign({
            accountId: IDS.account,
            roundId: VIDEO_IDS.round,
        });
        expect(insertsInto(queries, TABLES.event)).toHaveLength(0);
        expect(updatesOf(queries, TABLES.account)).toHaveLength(0);
    });

    it('assign is a no-op that skips re-validation when reassigning to the same round, even once that round has closed or gone over budget', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ round_id: VIDEO_IDS.round })],
                [TABLES.fee]: [feeRow({ amount_cents: 150_000 })],
                [VIDEO_TABLES.round]: [
                    roundRow({ status: RoundStatus.Closed }),
                ],
            }),
        );
        await expect(
            caller.round.assign({
                accountId: IDS.account,
                roundId: VIDEO_IDS.round,
            }),
        ).resolves.toMatchObject({ id: IDS.account });
        const roundReads = queries.filter(
            (query) => readTable(query) === VIDEO_TABLES.round,
        );
        expect(roundReads).toHaveLength(0);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('assign fails loud at the events quota when the round actually changes, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder(
                { [TABLES.fee]: [feeRow({ amount_cents: 16_500 })] },
                { [TABLES.event]: PROP_QUOTA_LIMITS[PropQuota.Events] },
            ),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.round.assign({
                    accountId: IDS.account,
                    roundId: VIDEO_IDS.round,
                }),
            ),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection).toMatchObject({
            quota: PropQuota.Events,
            reason: PropLimitRejection.QuotaExceeded,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('assign unassigns an account from its round without a budget check', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ round_id: VIDEO_IDS.round })],
            }),
        );
        await caller.round.assign({ accountId: IDS.account, roundId: null });
        const [update] = updatesOf(queries, TABLES.account);
        expect(update?.text).toMatch(/"round_id" = /);
        const roundReads = queries.filter(
            (query) => readTable(query) === VIDEO_TABLES.round,
        );
        expect(roundReads).toHaveLength(0);
    });

    it('assign of a foreign round throws NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.round]: [] }),
        );
        await expect(
            caller.round.assign({
                accountId: IDS.account,
                roundId: VIDEO_IDS.round,
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create opens the round for the session user after the quota check, in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.round.create({
            budgetCents: 100_000,
            firmId: FirmId.Mffu,
            label: 'September round',
            openedOn: '2026-09-01',
        });
        const count = queries.find((query) => isCount(query));
        expect(readTable(defined(count))).toBe(VIDEO_TABLES.round);
        assertUserScopedWhere(defined(count), USER_ID);
        const [insert] = insertsInto(queries, VIDEO_TABLES.round);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(insert), 'status')).toEqual([
            RoundStatus.Open,
        ]);
        expect(insertedColumnValues(defined(insert), 'closed_on')).toEqual([
            null,
        ]);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('create and update with neither a listed nor an own firm are refused before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.round.create({
                label: 'No firm round',
                openedOn: '2026-09-01',
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        await expect(
            caller.round.update({ ...ROUND_UPDATE, firmId: null }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('create at one of the caller own firms reads that firm scoped by user', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.round.create({
            externalFirmId: VIDEO_IDS.externalFirm,
            label: 'Hola round',
            openedOn: '2026-09-01',
        });
        const firmLoad = queries.find(
            (query) => readTable(query) === VIDEO_TABLES.externalFirm,
        );
        assertUserScopedWhere(defined(firmLoad), USER_ID);
        expect(firmLoad?.params).toContain(VIDEO_IDS.externalFirm);
        expect(insertsInto(queries, VIDEO_TABLES.round)).toHaveLength(1);
    });

    it('create and update with another user firm are rejected with a typed reason and write nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.externalFirm]: [] }),
        );
        for (const call of [
            () =>
                caller.round.create({
                    externalFirmId: VIDEO_IDS.externalFirm,
                    label: 'Foreign round',
                    openedOn: '2026-09-01',
                }),
            () =>
                caller.round.update({
                    ...ROUND_UPDATE,
                    externalFirmId: VIDEO_IDS.externalFirm,
                    firmId: null,
                }),
        ]) {
            const shape = errorShapeOf(await rejectionOf(call()));
            expect(shape.data.code).toBe('NOT_FOUND');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.ReferenceNotOwned),
            );
        }
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create fails loud at the round quota and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder(
                {},
                { [VIDEO_TABLES.round]: PROP_QUOTA_LIMITS[PropQuota.Rounds] },
            ),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.round.create({
                    firmId: FirmId.Mffu,
                    label: 'One more',
                    openedOn: '2026-09-01',
                }),
            ),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection).toMatchObject({
            quota: PropQuota.Rounds,
            reason: PropLimitRejection.QuotaExceeded,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rate-limits changes in the round bucket per user', async () => {
        rateLimit.mockClear();
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await caller.round.close({
            closedOn: '2026-09-30',
            id: VIDEO_IDS.round,
        });
        expect(rateLimit).toHaveBeenCalledWith(
            expect.objectContaining({
                bucket: 'prop-accounts:round',
                key: USER_ID,
            }),
        );
    });

    it('list returns the caller rounds from a scoped, bounded read', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const rounds = await caller.round.list();
        expect(rounds.map((round) => round.label)).toEqual(['September round']);
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.text).toMatch(/ limit \$\d+$/);
    });

    it('update loads the owned round and writes its fields by id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.round.update(ROUND_UPDATE);
        const load = queries.find(
            (query) => readTable(query) === VIDEO_TABLES.round,
        );
        assertUserScopedWhere(defined(load), USER_ID);
        const [update] = updatesOf(queries, VIDEO_TABLES.round);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                150_000,
                'Raised the budget',
                VIDEO_IDS.round,
            ]),
        );
    });

    it('close locks the round and sets the status and the closing date in one statement', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.round.close({
            closedOn: '2026-09-30',
            id: VIDEO_IDS.round,
        });
        const load = queries.find(
            (query) => readTable(query) === VIDEO_TABLES.round,
        );
        expect(load?.text).toMatch(/ for update$/);
        assertUserScopedWhere(defined(load), USER_ID);
        const updates = updatesOf(queries, VIDEO_TABLES.round);
        expect(updates).toHaveLength(1);
        const [update] = updates;
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.text).toMatch(/"status" = \$\d+/);
        expect(update?.text).toMatch(/"closed_on" = \$\d+/);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                RoundStatus.Closed,
                '2026-09-30',
                VIDEO_IDS.round,
            ]),
        );
    });

    it('close refuses a round that is already closed, with a typed reason, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [VIDEO_TABLES.round]: [
                    roundRow({
                        closed_on: '2026-09-20',
                        status: RoundStatus.Closed,
                    }),
                ],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.round.close({
                    closedOn: '2026-09-30',
                    id: VIDEO_IDS.round,
                }),
            ),
        );
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.message).toContain('"September round"');
        expect(shape.message).toContain('2026-09-20');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RoundClosed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('close refuses a closing date before the opening date, with a typed reason, and writes nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const shape = errorShapeOf(
            await rejectionOf(
                caller.round.close({
                    closedOn: '2026-08-31',
                    id: VIDEO_IDS.round,
                }),
            ),
        );
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('2026-09-01');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('update refuses an opening date after the closing date of a closed round and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [VIDEO_TABLES.round]: [
                    roundRow({
                        closed_on: '2026-09-20',
                        status: RoundStatus.Closed,
                    }),
                ],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.round.update({
                    ...ROUND_UPDATE,
                    openedOn: '2026-09-21',
                }),
            ),
        );
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('remove deletes an unused round by id and user id after a scoped reference check', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [] }),
        );
        await expect(
            caller.round.remove({ id: VIDEO_IDS.round }),
        ).resolves.toEqual({ ok: true });
        const reference = queries.find(
            (query) => readTable(query) === TABLES.account,
        );
        assertUserScopedWhere(defined(reference), USER_ID);
        expect(reference?.params).toContain(VIDEO_IDS.round);
        const [removal] = deletesFrom(queries, VIDEO_TABLES.round);
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(removal?.params).toContain(VIDEO_IDS.round);
    });

    it('remove refuses a round an account still belongs to, with a typed reason, and deletes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ round_id: VIDEO_IDS.round })],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.round.remove({ id: VIDEO_IDS.round })),
        );
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.message).toContain('"September round"');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RecordInUse),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('update, close and remove of another user round throw NOT_FOUND and write nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.round]: [] }),
        );
        for (const call of [
            () => caller.round.update(ROUND_UPDATE),
            () =>
                caller.round.close({
                    closedOn: '2026-09-30',
                    id: VIDEO_IDS.round,
                }),
            () => caller.round.remove({ id: VIDEO_IDS.round }),
        ]) {
            await expect(call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
        }
        expect(propWrites(queries)).toHaveLength(0);
    });
});
