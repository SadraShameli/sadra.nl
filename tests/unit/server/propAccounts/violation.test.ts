import { afterEach, describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import { RuleViolationKind, ViolationSource } from '~/lib/prop-accounts';
import { PROP_QUOTA_LIMITS } from '~/lib/prop-accounts/server';
import {
    PropLimitRejection,
    PropMutationRejection,
    PropQuota,
} from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    type FakeRow,
    insertedColumnValues,
    type IssuedQuery,
    readTable,
    TransactionStep,
    transactionSteps,
    writeTable,
} from '../fakeDatabase';
import {
    accountUpdateInput,
    callerFor,
    decisionRow,
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
import { VIDEO_IDS, VIDEO_TABLES, violationRow } from './videoRecordFixtures';

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

function violationSelectsReturn(
    existing: FakeRow[],
    counts: Readonly<Record<string, number>> = {},
) {
    const base = tableResponder({}, counts);
    return (query: IssuedQuery): FakeRow[] =>
        readTable(query) === VIDEO_TABLES.violation &&
        writeTable(query) === null &&
        !isCount(query)
            ? existing
            : base(query);
}

const OVERSIZE = {
    accountId: IDS.account,
    costCents: 25_000,
    decisionId: IDS.decision,
    kind: RuleViolationKind.Oversize,
    occurredOn: '2026-09-21',
};

const VIOLATION_UPDATE = {
    costCents: -12_000,
    decisionId: IDS.decision,
    id: VIDEO_IDS.violation,
    kind: RuleViolationKind.ChasedLoss,
    note: 'Won, but outside the plan',
    occurredOn: '2026-09-22',
};

type Caller = ReturnType<typeof callerFor>['caller'];

const WRITES_WITH_REFERENCES: readonly {
    readonly call: (
        caller: Caller,
        fields: Record<string, unknown>,
    ) => Promise<unknown>;
    readonly name: string;
}[] = [
    {
        call: (caller, fields) =>
            caller.violation.create({ ...OVERSIZE, ...fields }),
        name: 'create',
    },
    {
        call: (caller, fields) =>
            caller.violation.update({ ...VIOLATION_UPDATE, ...fields }),
        name: 'update',
    },
];

afterEach(() => {
    vi.useRealTimers();
});

describe('propAccounts.violation', () => {
    it('create stores a manual violation for the session user after scoped account and decision reads, in one transaction', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            violationSelectsReturn([]),
        );
        const created = await caller.violation.create(OVERSIZE);
        expect(created.source).toBe(ViolationSource.Manual);
        for (const table of [TABLES.account, TABLES.decision]) {
            const read = queries.find((query) => readTable(query) === table);
            assertUserScopedWhere(defined(read), USER_ID);
        }
        const count = queries.find((query) => isCount(query));
        expect(readTable(defined(count))).toBe(VIDEO_TABLES.violation);
        assertUserScopedWhere(defined(count), USER_ID);
        const [insert] = insertsInto(queries, VIDEO_TABLES.violation);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(insert), 'source')).toEqual([
            ViolationSource.Manual,
        ]);
        expect(insertedColumnValues(defined(insert), 'account_id')).toEqual([
            IDS.account,
        ]);
        expect(insertedColumnValues(defined(insert), 'decision_id')).toEqual([
            IDS.decision,
        ]);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('create keeps a negative cost signed: a violation trade that won is disclosed, not hidden', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            violationSelectsReturn([]),
        );
        await caller.violation.create({ ...OVERSIZE, costCents: -12_000 });
        const [insert] = insertsInto(queries, VIDEO_TABLES.violation);
        expect(insertedColumnValues(defined(insert), 'cost_cents')).toEqual([
            -12_000,
        ]);
    });

    it('create without a decision reads no decision and never looks for an existing violation of the decision', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            violationSelectsReturn([violationRow()]),
        );
        await caller.violation.create({ ...OVERSIZE, decisionId: null });
        expect(
            queries.filter((query) => readTable(query) === TABLES.decision),
        ).toHaveLength(0);
        expect(
            queries.filter(
                (query) =>
                    readTable(query) === VIDEO_TABLES.violation &&
                    !isCount(query),
            ),
        ).toHaveLength(0);
        expect(insertsInto(queries, VIDEO_TABLES.violation)).toHaveLength(1);
    });

    it('create with a decision is idempotent per user, account, decision and kind: an existing row is returned, nothing is written and no quota is taken', async () => {
        const existing = violationRow({
            account_id: IDS.account,
            decision_id: IDS.decision,
            kind: RuleViolationKind.Oversize,
        });
        const { caller, queries } = callerFor(
            SIGNED_IN,
            violationSelectsReturn([existing], {
                [VIDEO_TABLES.violation]:
                    PROP_QUOTA_LIMITS[PropQuota.Violations],
            }),
        );

        const created = await caller.violation.create(OVERSIZE);

        expect(created.id).toBe(VIDEO_IDS.violation);
        expect(propWrites(queries)).toHaveLength(0);
        expect(queries.filter((query) => isCount(query))).toHaveLength(0);
        const lookup = queries.find(
            (query) =>
                readTable(query) === VIDEO_TABLES.violation &&
                !isCount(query),
        );
        assertUserScopedWhere(defined(lookup), USER_ID);
        expect(lookup?.params).toEqual(
            expect.arrayContaining([
                IDS.account,
                IDS.decision,
                RuleViolationKind.Oversize,
            ]),
        );
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('create with a decision still inserts when that decision has no violation of this kind yet, and takes the quota', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            violationSelectsReturn([]),
        );

        await caller.violation.create(OVERSIZE);

        expect(insertsInto(queries, VIDEO_TABLES.violation)).toHaveLength(1);
        expect(queries.filter((query) => isCount(query))).toHaveLength(1);
    });

    it('create returns an existing violation only after the account and decision ownership checks, so another user decision still rejects', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            (query) =>
                readTable(query) === TABLES.decision
                    ? []
                    : violationSelectsReturn([violationRow()])(query),
        );

        const shape = errorShapeOf(
            await rejectionOf(caller.violation.create(OVERSIZE)),
        );

        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ReferenceNotOwned),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('the client cannot set the source: detected violations come from the server only', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.violation.create({
                ...OVERSIZE,
                source: ViolationSource.Detected,
            } as never),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('create on another user account is rejected with a typed reason and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [] }),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.violation.create(OVERSIZE)),
        );
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ReferenceNotOwned),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it.each(WRITES_WITH_REFERENCES)(
        '$name linking another user decision is rejected with a typed reason and writes nothing',
        async ({ call }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                tableResponder({ [TABLES.decision]: [] }),
            );
            const shape = errorShapeOf(await rejectionOf(call(caller, {})));
            expect(shape.data.code).toBe('NOT_FOUND');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.ReferenceNotOwned),
            );
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it.each(WRITES_WITH_REFERENCES)(
        '$name linking a decision of another of the caller accounts is rejected before the database would, and writes nothing',
        async ({ call }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                tableResponder({
                    [TABLES.decision]: [
                        decisionRow({ account_id: IDS.otherAccount }),
                    ],
                }),
            );
            const shape = errorShapeOf(await rejectionOf(call(caller, {})));
            expect(shape.data.code).toBe('BAD_REQUEST');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.DecisionOfOtherAccount),
            );
            const decisionRead = queries.find(
                (query) => readTable(query) === TABLES.decision,
            );
            assertUserScopedWhere(defined(decisionRead), USER_ID);
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it.each(WRITES_WITH_REFERENCES)(
        '$name dated before the account purchase date is rejected with a typed reason and writes nothing',
        async ({ call }) => {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            const shape = errorShapeOf(
                await rejectionOf(call(caller, { occurredOn: '2026-08-31' })),
            );
            expect(shape.data.code).toBe('BAD_REQUEST');
            expect(shape.message).toContain('2026-09-01');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.OutOfOrderEvent),
            );
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it.each(WRITES_WITH_REFERENCES)(
        '$name dated after the latest date anywhere on earth is rejected as a future date and writes nothing',
        async ({ call }) => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            const shape = errorShapeOf(
                await rejectionOf(call(caller, { occurredOn: '2026-09-27' })),
            );
            expect(shape.data.code).toBe('BAD_REQUEST');
            expect(shape.message).toContain('2026-09-27');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.FutureDate),
            );
            expect(propWrites(queries)).toHaveLength(0);
            await expect(
                call(caller, { occurredOn: '2026-09-26' }),
            ).resolves.toBeDefined();
        },
    );

    it('create fails loud at the violation quota and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            violationSelectsReturn([], {
                [VIDEO_TABLES.violation]:
                    PROP_QUOTA_LIMITS[PropQuota.Violations],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.violation.create(OVERSIZE)),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection).toMatchObject({
            quota: PropQuota.Violations,
            reason: PropLimitRejection.QuotaExceeded,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rate-limits changes in the violation bucket per user', async () => {
        rateLimit.mockClear();
        const { caller } = callerFor(SIGNED_IN, violationSelectsReturn([]));
        await caller.violation.create(OVERSIZE);
        expect(rateLimit).toHaveBeenCalledWith(
            expect.objectContaining({
                bucket: 'prop-accounts:violation',
                key: USER_ID,
            }),
        );
    });

    it('update loads the owned violation, re-checks its account and decision, and writes by id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.violation.update(VIOLATION_UPDATE);
        for (const table of [
            VIDEO_TABLES.violation,
            TABLES.account,
            TABLES.decision,
        ]) {
            const read = queries.find((query) => readTable(query) === table);
            assertUserScopedWhere(defined(read), USER_ID);
        }
        const [update] = updatesOf(queries, VIDEO_TABLES.violation);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                -12_000,
                RuleViolationKind.ChasedLoss,
                'Won, but outside the plan',
                '2026-09-22',
                VIDEO_IDS.violation,
            ]),
        );
    });

    it.each([
        {
            call: (caller: Caller) => caller.violation.create(OVERSIZE),
            name: 'create',
        },
        {
            call: (caller: Caller) => caller.violation.update(VIOLATION_UPDATE),
            name: 'update',
        },
    ])(
        '$name locks the account row so the purchase date check cannot race an account edit',
        async ({ call }) => {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            await call(caller);
            const load = queries.find(
                (query) => readTable(query) === TABLES.account,
            );
            expect(load?.text).toMatch(/ for update$/);
            assertUserScopedWhere(defined(load), USER_ID);
        },
    );

    it('list filters by account only on top of the user scope', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.violation.list({});
        await caller.violation.list({ accountId: IDS.account });
        const [all, one] = queries;
        assertUserScopedWhere(defined(all), USER_ID);
        expect(all?.text).not.toMatch(/"account_id" = /);
        expect(all?.text).toMatch(/ limit \$\d+$/);
        assertUserScopedWhere(defined(one), USER_ID);
        expect(one?.params).toContain(IDS.account);
    });

    it('remove deletes the owned violation by id and user id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.violation.remove({ id: VIDEO_IDS.violation }),
        ).resolves.toEqual({ ok: true });
        const [removal] = deletesFrom(queries, VIDEO_TABLES.violation);
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(removal?.params).toContain(VIDEO_IDS.violation);
    });

    it('update and remove of another user violation throw NOT_FOUND and write nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.violation]: [] }),
        );
        await expect(
            caller.violation.update(VIOLATION_UPDATE),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
            caller.violation.remove({ id: VIDEO_IDS.violation }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });
});

describe('propAccounts.account.update and recorded violations', () => {
    const VIOLATIONS = [
        violationRow({ id: VIDEO_IDS.decision, occurred_on: '2026-09-10' }),
        violationRow({ occurred_on: '2026-09-20' }),
    ];

    it('refuses to move the purchase date after the earliest recorded violation, reads violations by user and account, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.event]: [],
                [VIDEO_TABLES.violation]: VIOLATIONS,
            }),
        );
        const update = caller.account.update(
            accountUpdateInput({ purchasedOn: '2026-09-15' }),
        );
        const shape = errorShapeOf(await rejectionOf(update));
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/2026-09-15/);
        expect(shape.message).toMatch(/2026-09-10/);
        expect(shape.message).toMatch(/violation/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const violationRead = queries.find(
            (query) => readTable(query) === VIDEO_TABLES.violation,
        );
        assertUserScopedWhere(defined(violationRead), USER_ID);
        expect(violationRead?.params).toContain(IDS.account);
    });

    it('reads the earliest recorded violation with one bounded, ascending query instead of the whole violation list', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.event]: [],
                [VIDEO_TABLES.violation]: VIOLATIONS,
            }),
        );
        await rejectionOf(
            caller.account.update(
                accountUpdateInput({ purchasedOn: '2026-09-15' }),
            ),
        );
        const violationReads = queries.filter(
            (query) => readTable(query) === VIDEO_TABLES.violation,
        );
        expect(violationReads).toHaveLength(1);
        expect(violationReads[0]?.text).toMatch(
            /order by (?:"\w+"\.)?"occurred_on" asc limit \$\d+$/,
        );
    });

    it('moves the purchase date up to the day of the earliest recorded violation', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.event]: [],
                [VIDEO_TABLES.violation]: VIOLATIONS,
            }),
        );
        await caller.account.update(
            accountUpdateInput({ purchasedOn: '2026-09-10' }),
        );
        expect(updatesOf(queries, TABLES.account)).toHaveLength(1);
    });

    it('reads no violations when the purchase date stays put', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.update(accountUpdateInput({ label: 'Renamed' }));
        const violationReads = queries.filter(
            (query) => readTable(query) === VIDEO_TABLES.violation,
        );
        expect(violationReads).toHaveLength(0);
    });
});
