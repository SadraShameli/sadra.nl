import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import {
    AccountEventKind,
    AccountStage,
    FeeKind,
    PayoutStatus,
    SnapshotSource,
} from '~/lib/prop-accounts';
import {
    PROP_MUTATION_WINDOW_MS,
    PROP_MUTATIONS_PER_WINDOW,
    PROP_QUOTA_LIMITS,
    PropQuotaExceededError,
    PropQuotaGuard,
} from '~/lib/prop-accounts/server';
import { AdviceSource } from '~/lib/prop-calculator/advisor';
import {
    PropLimitRejection,
    PropMutationRejection,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    propMutationProcedure,
    PropMutationRejectionError,
    PropRouterBucket,
} from '~/server/api/routers/propAccounts/mutationGuard';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    assertUserScopedWhere,
    createFakeDatabase,
    FakeDatabaseError,
    type FakeRow,
    type IssuedQuery,
    readTable,
} from '../fakeDatabase';
import {
    accountCreateInput,
    accountRow,
    accountUpdateInput,
    callerFor,
    copyGroupRow,
    decisionRow,
    defined,
    errorShapeOf,
    feeRow,
    IDS,
    isCount,
    payoutRow,
    propWrites,
    rejectionOf,
    type Responder,
    scenarioRow,
    SIGNED_IN,
    snapshotRow,
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

const rateLimit = vi.mocked(isWithinRateLimit);

beforeEach(() => {
    rateLimit.mockClear();
    rateLimit.mockImplementation(() => Promise.resolve(true));
});

interface QuotaCase {
    readonly call: (
        caller: ReturnType<typeof callerFor>['caller'],
    ) => Promise<unknown>;
    readonly name: string;
    readonly quota: PropQuota;
    readonly table: string;
}

function snapshotInput(accountId: string) {
    return {
        accountId,
        asOf: '2026-09-21',
        balanceCents: 5_050_000,
        dashboardFloorCents: 4_900_000,
        highestEodBalanceCents: 5_100_000,
        source: SnapshotSource.Manual,
        tradingDays: 4,
    };
}

const QUOTA_CASES: readonly QuotaCase[] = [
    {
        call: (caller) => caller.account.create(accountCreateInput()),
        name: 'the 201st account',
        quota: PropQuota.Accounts,
        table: TABLES.account,
    },
    {
        call: (caller) => caller.snapshot.create(snapshotInput(IDS.account)),
        name: 'the next snapshot past the snapshot cap',
        quota: PropQuota.Snapshots,
        table: TABLES.snapshot,
    },
    {
        call: (caller) =>
            caller.payout.create({
                accountId: IDS.account,
                grossCents: 50_000,
                requestedOn: '2026-09-08',
                status: PayoutStatus.Requested,
            }),
        name: 'the next payout past the payout cap',
        quota: PropQuota.Payouts,
        table: TABLES.payout,
    },
    {
        call: (caller) =>
            caller.fee.create({
                accountId: IDS.account,
                amountCents: 16_500,
                kind: FeeKind.EvalPurchase,
                paidOn: '2026-09-01',
            }),
        name: 'the next fee past the fee cap',
        quota: PropQuota.Fees,
        table: TABLES.fee,
    },
    {
        call: (caller) => caller.copyGroup.create({ name: 'One more' }),
        name: 'the 51st copy group',
        quota: PropQuota.CopyGroups,
        table: TABLES.copyGroup,
    },
    {
        call: (caller) =>
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.Busted,
                occurredOn: '2026-09-21',
            }),
        name: 'the next event past the event cap',
        quota: PropQuota.Events,
        table: TABLES.event,
    },
    {
        call: (caller) =>
            caller.decision.create({
                acceptedRiskCents: 40_000,
                acceptedRungsCents: [40_000],
                accountId: IDS.account,
                decidedOn: '2026-09-21',
                headlineRiskCents: 40_000,
                snapshotId: null,
                source: AdviceSource.Documented,
                stage: AccountStage.Eval,
            }),
        name: 'the next decision past the decision cap',
        quota: PropQuota.Decisions,
        table: TABLES.decision,
    },
    {
        call: (caller) => caller.snapshot.remove({ id: IDS.snapshot }),
        name: 'a snapshot removal that would log an event past the event cap',
        quota: PropQuota.Events,
        table: TABLES.event,
    },
];

interface LockedCase {
    readonly call: (
        caller: ReturnType<typeof callerFor>['caller'],
    ) => Promise<unknown>;
    readonly name: string;
    readonly responder?: Responder;
}

const LOCKED_CASES: readonly LockedCase[] = [
    ...QUOTA_CASES,
    {
        call: (caller) => caller.account.archive({ id: IDS.account }),
        name: 'account.archive',
    },
    {
        call: (caller) => caller.account.unarchive({ id: IDS.account }),
        name: 'account.unarchive',
        responder: tableResponder({
            [TABLES.account]: [
                accountRow({ archived_at: new Date('2026-09-10T00:00:00Z') }),
            ],
        }),
    },
    {
        call: (caller) =>
            caller.account.update(accountUpdateInput({ label: 'Renamed' })),
        name: 'account.update',
    },
    {
        call: (caller) =>
            caller.account.importMany([accountCreateInput({ label: 'One' })]),
        name: 'account.importMany',
    },
    {
        call: (caller) =>
            caller.snapshot.bulkCreate([snapshotInput(IDS.account)]),
        name: 'snapshot.bulkCreate',
    },
    {
        call: (caller) =>
            caller.copyGroup.assign({
                accountId: IDS.account,
                copyGroupId: IDS.copyGroup,
            }),
        name: 'copyGroup.assign',
    },
    {
        call: (caller) =>
            caller.scenario.save({ name: 'New', query: 'firm=mffu' }),
        name: 'scenario.save',
        responder: (query) =>
            readTable(query) === TABLES.scenario && !isCount(query)
                ? []
                : tableResponder()(query),
    },
];

interface ListCase {
    readonly call: (
        caller: ReturnType<typeof callerFor>['caller'],
    ) => Promise<unknown>;
    readonly limit: number;
    readonly name: string;
    readonly record: PropRecord;
    readonly row: () => FakeRow;
    readonly table: string;
}

const LIST_CASES: readonly ListCase[] = [
    {
        call: (caller) => caller.account.list({ includeArchived: true }),
        limit: PROP_QUOTA_LIMITS[PropQuota.Accounts],
        name: 'account.list',
        record: PropRecord.Account,
        row: accountRow,
        table: TABLES.account,
    },
    {
        call: (caller) => caller.snapshot.latestForAll(),
        limit: PROP_QUOTA_LIMITS[PropQuota.Accounts],
        name: 'snapshot.latestForAll',
        record: PropRecord.Snapshot,
        row: snapshotRow,
        table: TABLES.snapshot,
    },
    {
        call: (caller) => caller.snapshot.listForAccount({ id: IDS.account }),
        limit: PROP_QUOTA_LIMITS[PropQuota.Snapshots],
        name: 'snapshot.listForAccount',
        record: PropRecord.Snapshot,
        row: snapshotRow,
        table: TABLES.snapshot,
    },
    {
        call: (caller) => caller.payout.list({}),
        limit: PROP_QUOTA_LIMITS[PropQuota.Payouts],
        name: 'payout.list',
        record: PropRecord.Payout,
        row: payoutRow,
        table: TABLES.payout,
    },
    {
        call: (caller) => caller.fee.list({}),
        limit: PROP_QUOTA_LIMITS[PropQuota.Fees],
        name: 'fee.list',
        record: PropRecord.Fee,
        row: feeRow,
        table: TABLES.fee,
    },
    {
        call: (caller) => caller.decision.listForAccount({ id: IDS.account }),
        limit: PROP_QUOTA_LIMITS[PropQuota.Decisions],
        name: 'decision.listForAccount',
        record: PropRecord.Decision,
        row: decisionRow,
        table: TABLES.decision,
    },
    {
        call: (caller) => caller.copyGroup.list(),
        limit: PROP_QUOTA_LIMITS[PropQuota.CopyGroups],
        name: 'copyGroup.list',
        record: PropRecord.CopyGroup,
        row: copyGroupRow,
        table: TABLES.copyGroup,
    },
    {
        call: (caller) => caller.scenario.list(),
        limit: PROP_QUOTA_LIMITS[PropQuota.Scenarios],
        name: 'scenario.list',
        record: PropRecord.Scenario,
        row: scenarioRow,
        table: TABLES.scenario,
    },
];

function limitParameter(query: IssuedQuery): unknown {
    const match = / limit \$(\d+)$/.exec(query.text);
    return match?.[1] ? query.params[Number(match[1]) - 1] : undefined;
}

function rowsPast(limit: number, row: () => FakeRow): FakeRow[] {
    return Array.from({ length: limit + 1 }, row);
}

describe('propAccounts quotas', () => {
    it('keeps the PD-36 defaults', () => {
        expect(PROP_QUOTA_LIMITS[PropQuota.Accounts]).toBe(200);
        expect(PROP_QUOTA_LIMITS[PropQuota.Snapshots]).toBe(20_000);
        expect(PROP_QUOTA_LIMITS[PropQuota.Payouts]).toBe(5000);
        expect(PROP_QUOTA_LIMITS[PropQuota.Fees]).toBe(5000);
        expect(PROP_QUOTA_LIMITS[PropQuota.CopyGroups]).toBe(50);
        expect(PROP_QUOTA_LIMITS[PropQuota.Scenarios]).toBe(100);
        expect(PROP_MUTATIONS_PER_WINDOW).toBe(60);
        expect(PROP_MUTATION_WINDOW_MS).toBe(60_000);
    });

    it.each(QUOTA_CASES)(
        'rejects $name with TOO_MANY_REQUESTS and a typed quota error',
        async ({ call, quota, table }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                tableResponder({}, { [table]: PROP_QUOTA_LIMITS[quota] }),
            );
            const shape = errorShapeOf(await rejectionOf(call(caller)));
            expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
            expect(shape.data.propRejection).toEqual({
                lifecycleRejection: null,
                limit: PROP_QUOTA_LIMITS[quota],
                quota,
                reason: PropLimitRejection.QuotaExceeded,
                record: null,
                recordId: null,
            });
            expect(propWrites(queries)).toHaveLength(0);
            const count = queries.find(
                (query) => isCount(query) && readTable(query) === table,
            );
            expect(count?.params).toContain(USER_ID);
        },
    );

    it.each(QUOTA_CASES)(
        'allows $name one below the cap',
        async ({ call, quota, table }) => {
            const { caller } = callerFor(
                SIGNED_IN,
                tableResponder({}, { [table]: PROP_QUOTA_LIMITS[quota] - 1 }),
            );
            await expect(call(caller)).resolves.toBeDefined();
        },
    );

    it('counts a whole batch against the cap: bulk snapshots and account imports', async () => {
        const snapshots = callerFor(
            SIGNED_IN,
            tableResponder(
                {
                    [TABLES.account]: [
                        accountRow(),
                        accountRow({ id: IDS.otherAccount, label: 'Two' }),
                    ],
                },
                {
                    [TABLES.snapshot]:
                        PROP_QUOTA_LIMITS[PropQuota.Snapshots] - 1,
                },
            ),
        );
        await expect(
            snapshots.caller.snapshot.bulkCreate([
                snapshotInput(IDS.account),
                snapshotInput(IDS.otherAccount),
            ]),
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
        expect(propWrites(snapshots.queries)).toHaveLength(0);

        const accounts = callerFor(
            SIGNED_IN,
            tableResponder(
                {},
                { [TABLES.account]: PROP_QUOTA_LIMITS[PropQuota.Accounts] - 1 },
            ),
        );
        await expect(
            accounts.caller.account.importMany([
                accountCreateInput({ label: 'One' }),
                accountCreateInput({ label: 'Two' }),
            ]),
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
        expect(propWrites(accounts.queries)).toHaveLength(0);
    });

    it('rejects the 101st saved scenario but still lets an existing name be overwritten', async () => {
        const base = tableResponder(
            {},
            { [TABLES.scenario]: PROP_QUOTA_LIMITS[PropQuota.Scenarios] },
        );
        const fresh = callerFor(SIGNED_IN, (query) =>
            readTable(query) === TABLES.scenario && !isCount(query)
                ? []
                : base(query),
        );
        await expect(
            fresh.caller.scenario.save({ name: 'New', query: 'firm=mffu' }),
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });

        const existing = callerFor(SIGNED_IN, base);
        await expect(
            existing.caller.scenario.save({
                name: 'Scenario one',
                query: 'firm=mffu',
            }),
        ).resolves.toBeDefined();
    });

    it.each(LOCKED_CASES)(
        '$name takes the per-user quota lock first in its transaction, before counting',
        async ({ call, responder }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                responder ?? tableResponder(),
            );
            await call(caller);
            const [begin, lock] = queries;
            expect(begin?.text).toBe('begin');
            expect(lock?.text).toBe(
                'select pg_advisory_xact_lock(hashtextextended($1, 0))',
            );
            expect(lock?.params).toEqual([`prop-quota:${USER_ID}`]);
            expect(
                queries.filter((query) => query.text.includes('pg_advisory')),
            ).toHaveLength(1);
        },
    );

    it.each(LIST_CASES)(
        '$name fails loud past its cap instead of dropping rows',
        async ({ call, limit, record, row, table }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                tableResponder({ [table]: rowsPast(limit, row) }),
            );
            const shape = errorShapeOf(await rejectionOf(call(caller)));
            expect(shape.data.code).toBe('BAD_REQUEST');
            expect(shape.data.propRejection).toEqual({
                lifecycleRejection: null,
                limit,
                quota: null,
                reason: PropLimitRejection.ListTooLarge,
                record,
                recordId: null,
            });
            const list = queries.find((query) => readTable(query) === table);
            expect(limitParameter(defined(list))).toBe(limit + 1);
        },
    );

    it.each([
        {
            call: (caller: ReturnType<typeof callerFor>['caller']) =>
                caller.account.remove({ id: IDS.account }),
            name: 'account.remove over its replacing accounts',
        },
        {
            call: (caller: ReturnType<typeof callerFor>['caller']) =>
                caller.copyGroup.remove({ id: IDS.copyGroup }),
            name: 'copyGroup.remove over its members',
        },
    ])(
        '$name fails loud past the account cap and writes nothing',
        async ({ call }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                tableResponder({
                    [TABLES.account]: rowsPast(
                        PROP_QUOTA_LIMITS[PropQuota.Accounts],
                        accountRow,
                    ),
                }),
            );
            const shape = errorShapeOf(await rejectionOf(call(caller)));
            expect(shape.data.propRejection).toEqual({
                lifecycleRejection: null,
                limit: PROP_QUOTA_LIMITS[PropQuota.Accounts],
                quota: null,
                reason: PropLimitRejection.ListTooLarge,
                record: PropRecord.Account,
                recordId: null,
            });
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it('rejects a mutation past the rate limit before touching the database', async () => {
        rateLimit.mockImplementation(() => Promise.resolve(false));
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.account.create(accountCreateInput()),
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
        expect(queries).toHaveLength(0);
    });

    it('rate-limits per router with the session user as the key', async () => {
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.archive({ id: IDS.account });
        await caller.fee.remove({ id: IDS.fee });
        expect(rateLimit.mock.calls.map(([options]) => options)).toEqual([
            {
                bucket: 'prop-accounts:account',
                key: USER_ID,
                max: PROP_MUTATIONS_PER_WINDOW,
                windowMs: PROP_MUTATION_WINDOW_MS,
            },
            {
                bucket: 'prop-accounts:fee',
                key: USER_ID,
                max: PROP_MUTATIONS_PER_WINDOW,
                windowMs: PROP_MUTATION_WINDOW_MS,
            },
        ]);
    });

    it('does not rate-limit reads', async () => {
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.list({});
        await caller.rulebook.get();
        expect(rateLimit).not.toHaveBeenCalled();
    });
});

const VIDEO_QUOTAS: readonly {
    readonly label: string;
    readonly limit: number;
    readonly quota: PropQuota;
    readonly table: string;
}[] = [
    {
        label: 'bankroll transfers',
        limit: 5000,
        quota: PropQuota.BankrollTransfers,
        table: 'sadranl_prop_bankroll_transfer',
    },
    {
        label: 'external firms',
        limit: 100,
        quota: PropQuota.ExternalFirms,
        table: 'sadranl_prop_external_firm',
    },
    {
        label: 'firm statuses',
        limit: 200,
        quota: PropQuota.FirmEngagements,
        table: 'sadranl_prop_firm_engagement',
    },
    {
        label: 'firm statements',
        limit: 5000,
        quota: PropQuota.FirmStatements,
        table: 'sadranl_prop_firm_statement',
    },
    {
        label: 'rounds',
        limit: 500,
        quota: PropQuota.Rounds,
        table: 'sadranl_prop_round',
    },
    {
        label: 'rule violations',
        limit: 20_000,
        quota: PropQuota.Violations,
        table: 'sadranl_prop_rule_violation',
    },
];

function probeCaller(
    procedure: ReturnType<typeof propMutationProcedure>,
    fail: () => never,
) {
    const probe = createTRPCRouter({ run: procedure.mutation(fail) });
    const { database, queries } = createFakeDatabase(tableResponder());
    const caller = createCallerFactory(probe)({
        db: database,
        headers: new Headers(),
        session: SIGNED_IN as never,
    });
    return { caller, probe, queries };
}

describe('propAccounts video record quotas', () => {
    it.each(VIDEO_QUOTAS)(
        'caps $quota at $limit per user',
        ({ limit, quota }) => {
            expect(PROP_QUOTA_LIMITS[quota]).toBe(limit);
        },
    );

    it.each(VIDEO_QUOTAS)(
        'counts $quota on its own table for the caller only and fails loud at the cap',
        async ({ label, limit, quota, table }) => {
            const { database, queries } = createFakeDatabase(
                tableResponder({}, { [table]: limit }),
            );
            const guard = await PropQuotaGuard.acquire(database, USER_ID);
            await expect(guard.assertWithin(quota, 1)).rejects.toThrow(
                new PropQuotaExceededError(quota, limit),
            );
            await expect(guard.assertWithin(quota, 0)).resolves.toBeUndefined();
            const counts = queries.filter((query) => isCount(query));
            expect(counts).toHaveLength(2);
            for (const count of counts) {
                expect(readTable(count)).toBe(table);
                assertUserScopedWhere(count, USER_ID);
            }
            expect(new PropQuotaExceededError(quota, limit).message).toBe(
                `You can keep at most ${limit} ${label}`,
            );
        },
    );
});

describe('propAccounts video record buckets and rejections', () => {
    it.each([
        [PropRouterBucket.Bankroll, 'prop-accounts:bankroll'],
        [PropRouterBucket.ExternalFirm, 'prop-accounts:external-firm'],
        [PropRouterBucket.FirmEngagement, 'prop-accounts:firm-engagement'],
        [PropRouterBucket.FirmStatement, 'prop-accounts:firm-statement'],
        [PropRouterBucket.Round, 'prop-accounts:round'],
        [PropRouterBucket.Violation, 'prop-accounts:violation'],
    ] as const)(
        'rate-limits the %s bucket per user as %s',
        async (bucket, name) => {
            const { caller } = probeCaller(
                propMutationProcedure(bucket),
                () => {
                    throw new Error('stop');
                },
            );
            await rejectionOf(caller.run());
            expect(rateLimit.mock.calls.map(([options]) => options)).toEqual([
                {
                    bucket: name,
                    key: USER_ID,
                    max: PROP_MUTATIONS_PER_WINDOW,
                    windowMs: PROP_MUTATION_WINDOW_MS,
                },
            ]);
        },
    );

    it.each([
        [PropMutationRejection.DecisionOfOtherAccount, 'BAD_REQUEST'],
        [PropMutationRejection.FutureDate, 'BAD_REQUEST'],
        [PropMutationRejection.RecordInUse, 'CONFLICT'],
        [PropMutationRejection.ReferenceNotOwned, 'NOT_FOUND'],
        [PropMutationRejection.RoundBudgetExceeded, 'CONFLICT'],
        [PropMutationRejection.RoundClosed, 'CONFLICT'],
    ] as const)(
        'maps the %s rejection to %s with its typed reason and message',
        async (reason, code) => {
            const { caller, probe } = probeCaller(
                propMutationProcedure(PropRouterBucket.Round),
                () => {
                    throw new PropMutationRejectionError(
                        reason,
                        'Why it failed',
                    );
                },
            );
            const shape = errorShapeOf(await rejectionOf(caller.run()), probe);
            expect(shape.data.code).toBe(code);
            expect(shape.message).toBe('Why it failed');
            expect(shape.data.propRejection).toEqual({
                lifecycleRejection: null,
                limit: null,
                quota: null,
                reason,
                record: null,
                recordId: null,
            });
        },
    );

    it.each([
        [
            'prop_payout_approved_after_request_ck',
            'A payout cannot be approved before it was requested',
        ],
        [
            'prop_payout_paid_after_approval_ck',
            'A payout cannot be paid before it was approved',
        ],
    ])(
        'names the %s check violation as a BAD_REQUEST the user can act on',
        async (constraint, message) => {
            const { caller, probe } = probeCaller(
                propMutationProcedure(PropRouterBucket.Payout),
                () => {
                    throw new FakeDatabaseError('23514', constraint);
                },
            );
            const shape = errorShapeOf(await rejectionOf(caller.run()), probe);
            expect(shape.data.code).toBe('BAD_REQUEST');
            expect(shape.message).toBe(message);
        },
    );

    it.each([
        [
            'prop_external_firm_user_name_idx',
            'One of your firms already has this name',
        ],
        ['prop_round_user_label_idx', 'A round with this label already exists'],
        [
            'prop_firm_engagement_user_firm_idx',
            'This firm already has a status; change that one instead',
        ],
        [
            'prop_firm_engagement_user_external_firm_idx',
            'This firm already has a status; change that one instead',
        ],
    ])(
        'names the %s unique violation as a CONFLICT the user can act on',
        async (constraint, message) => {
            const { caller, probe } = probeCaller(
                propMutationProcedure(PropRouterBucket.Round),
                () => {
                    throw new FakeDatabaseError('23505', constraint);
                },
            );
            const shape = errorShapeOf(await rejectionOf(caller.run()), probe);
            expect(shape.data.code).toBe('CONFLICT');
            expect(shape.message).toBe(message);
        },
    );
});
