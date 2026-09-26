import { describe, expect, it, vi } from 'vitest';

import { AccountStage } from '~/lib/prop-accounts';
import { PropMutationRejection } from '~/lib/schemas/propAccountOutputs';

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

describe('propAccounts.copyGroup', () => {
    it('assign rejects another user group with NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.copyGroup]: [] }),
        );
        await expect(
            caller.copyGroup.assign({
                accountId: IDS.account,
                copyGroupId: IDS.copyGroup,
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        const groupLoad = queries.find(
            (query) => readTable(query) === TABLES.copyGroup,
        );
        assertUserScopedWhere(defined(groupLoad), USER_ID);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('assign rejects a group whose members have a different stage, with a typed reason', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow(),
                    accountRow({
                        copy_group_id: IDS.copyGroup,
                        id: IDS.otherAccount,
                        stage: AccountStage.Funded,
                    }),
                ],
            }),
        );
        const error = await rejectionOf(
            caller.copyGroup.assign({
                accountId: IDS.account,
                copyGroupId: IDS.copyGroup,
            }),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.message).toMatch(/stage/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MixedStageCopyGroup),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('assign to a same-stage group updates the account by id and user id and logs the edit', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow(),
                    accountRow({
                        copy_group_id: IDS.copyGroup,
                        id: IDS.otherAccount,
                    }),
                ],
            }),
        );
        await caller.copyGroup.assign({
            accountId: IDS.account,
            copyGroupId: IDS.copyGroup,
        });
        const [update] = updatesOf(queries, TABLES.account);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([IDS.copyGroup, IDS.account]),
        );
        expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
    });

    it('assign null leaves the group without any group check', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ copy_group_id: IDS.copyGroup }),
                ],
            }),
        );
        await caller.copyGroup.assign({
            accountId: IDS.account,
            copyGroupId: null,
        });
        expect(
            queries.filter((query) => readTable(query) === TABLES.copyGroup),
        ).toHaveLength(0);
        expect(updatesOf(queries, TABLES.account)[0]?.params).toContain(null);
    });

    it('create inserts for the session user after the quota check', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.copyGroup.create({ name: 'Group two' });
        expect(queries.some(isCount)).toBe(true);
        const [insert] = insertsInto(queries, TABLES.copyGroup);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
    });

    it('remove works when a member account has corrupt stored jsonb, and logs the edit for it', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        copy_group_id: IDS.copyGroup,
                        opt_ins: { takesFundedReset: 'yes' },
                    }),
                ],
            }),
        );
        await expect(
            caller.copyGroup.remove({ id: IDS.copyGroup }),
        ).resolves.toEqual({ ok: true });
        const [edit] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(edit), 'account_id')).toEqual([
            IDS.account,
        ]);
        const members = queries.find(
            (query) =>
                readTable(query) === TABLES.account &&
                query.text.startsWith('select'),
        );
        assertUserScopedWhere(defined(members), USER_ID);
        expect(members?.params).toContain(IDS.copyGroup);
    });

    it('assign checks the stages of a group whose other member has corrupt stored jsonb', async () => {
        const base = tableResponder();
        const { caller } = callerFor(SIGNED_IN, (query) =>
            readTable(query) === TABLES.account &&
            /"copy_group_id" = \$\d+/.test(query.text)
                ? [
                      accountRow({
                          copy_group_id: IDS.copyGroup,
                          id: IDS.otherAccount,
                          opt_ins: { takesFundedReset: 'yes' },
                          stage: AccountStage.Funded,
                      }),
                  ]
                : base(query),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.copyGroup.assign({
                    accountId: IDS.account,
                    copyGroupId: IDS.copyGroup,
                }),
            ),
        );
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MixedStageCopyGroup),
        );
    });

    it('remove clears member links before deleting the group, in one transaction', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ copy_group_id: IDS.copyGroup }),
                ],
            }),
        );
        await caller.copyGroup.remove({ id: IDS.copyGroup });
        const writes = propWrites(queries).map((query) => query.text);
        const clearIndex = writes.findIndex((text) =>
            text.startsWith(
                'update "sadranl_prop_account" set "copy_group_id" = $1',
            ),
        );
        const removalIndex = writes.findIndex((text) =>
            text.startsWith(`delete from "${TABLES.copyGroup}"`),
        );
        expect(clearIndex).toBeGreaterThanOrEqual(0);
        expect(removalIndex).toBeGreaterThan(clearIndex);
        assertUserScopedWhere(
            defined(deletesFrom(queries, TABLES.copyGroup)[0]),
            USER_ID,
        );
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });
});
