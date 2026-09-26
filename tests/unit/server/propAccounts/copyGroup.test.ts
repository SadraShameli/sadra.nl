import { describe, expect, it, vi } from 'vitest';

import { formatConjunctionList } from '~/lib/format';
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
    accountCreateInput,
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

describe('propAccounts copy-group stage check (PD-30)', () => {
    const FUNDED_MEMBER = {
        copy_group_id: IDS.copyGroup,
        id: IDS.otherAccount,
        stage: AccountStage.Funded,
    };

    async function assignRejection(member: Record<string, unknown>) {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow(), accountRow(member)],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.copyGroup.assign({
                    accountId: IDS.account,
                    copyGroupId: IDS.copyGroup,
                }),
            ),
        );
        return { queries, shape };
    }

    it('says which stage the group already has and which stage is joining', async () => {
        const { shape } = await assignRejection(FUNDED_MEMBER);
        expect(shape.message).toBe(
            'Copy group "Group one" would mix Evaluation and Funded accounts: it already has Funded members and the account joining is Evaluation. The members of a group must share one stage, inactive and archived members included.',
        );
    });

    it('counts an archived member of another stage, as today (Q44 default)', async () => {
        const { queries, shape } = await assignRejection({
            ...FUNDED_MEMBER,
            archived_at: new Date('2026-09-01T00:00:00Z'),
        });
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MixedStageCopyGroup),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('reads every member of the group: the member query filters on user and group only, never on archived_at or status (Q44 default)', async () => {
        const { queries } = await assignRejection(FUNDED_MEMBER);
        const memberReads = queries.filter(
            (query) =>
                readTable(query) === TABLES.account &&
                query.text.includes('"copy_group_id" = $'),
        );
        expect(memberReads).toHaveLength(1);
        const memberRead = defined(memberReads[0]);
        assertUserScopedWhere(memberRead, USER_ID);
        expect(memberRead.text.slice(memberRead.text.indexOf(' where '))).toBe(
            ` where ("${TABLES.account}"."user_id" = $1 and "${TABLES.account}"."copy_group_id" = $2) limit $3`,
        );
        expect(memberRead.params.slice(0, 2)).toEqual([USER_ID, IDS.copyGroup]);
    });

    it('names every stage when imported rows would mix stages in an empty group', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [] }),
        );
        const rows = [
            accountCreateInput({ copyGroupId: IDS.copyGroup, label: 'One' }),
            accountCreateInput({
                copyGroupId: IDS.copyGroup,
                fundedOn: '2026-09-10',
                label: 'Two',
                stage: AccountStage.Funded,
            }),
        ];
        const shape = errorShapeOf(
            await rejectionOf(caller.account.importMany(rows)),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MixedStageCopyGroup),
        );
        expect(shape.message).toBe(
            'Copy group "Group one" would mix Evaluation and Funded accounts: the accounts joining are Evaluation and Funded. The members of a group must share one stage, inactive and archived members included.',
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('lists three stages with the shared list format', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [] }),
        );
        const rows = [
            accountCreateInput({ copyGroupId: IDS.copyGroup, label: 'One' }),
            accountCreateInput({
                copyGroupId: IDS.copyGroup,
                fundedOn: '2026-09-10',
                label: 'Two',
                stage: AccountStage.Funded,
            }),
            accountCreateInput({
                copyGroupId: IDS.copyGroup,
                fundedOn: '2026-09-10',
                label: 'Three',
                stage: AccountStage.Live,
            }),
        ];
        const shape = errorShapeOf(
            await rejectionOf(caller.account.importMany(rows)),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MixedStageCopyGroup),
        );
        expect(shape.message).toBe(
            `Copy group "Group one" would mix ${formatConjunctionList(['Evaluation', 'Funded', 'Live'])} accounts: the accounts joining are Evaluation, Funded and Live. The members of a group must share one stage, inactive and archived members included.`,
        );
        expect(propWrites(queries)).toHaveLength(0);
    });
});
