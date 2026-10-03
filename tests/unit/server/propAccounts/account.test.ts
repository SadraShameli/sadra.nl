import { describe, expect, it, vi } from 'vitest';

import { buildAccountListRows } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { portfolioAlerts } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { captureError } from '~/lib/observability/logger';
import {
    AccountEventKind,
    type AccountReadIssue,
    AccountReadIssueKind,
    AccountStage,
    AlertKind,
    compareText,
    describeAccountReadIssue,
    LifecycleRejection,
    NO_ACCOUNT_STATES,
    PlanKeyResolutionKind,
    readAccountEventDetail,
    resolvePlanKey,
    RoundStatus,
    trackedAccountOf,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts';
import { PropInvalidStoredRecordError } from '~/lib/prop-accounts/server';
import { NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    PropMutationRejection,
    PropRecord,
    PropStoredRecordRejection,
    STORED_DATA_OWNER_REPAIR,
} from '~/lib/schemas/propAccountOutputs';
import { MAX_IMPORT_ROWS } from '~/lib/schemas/propAccounts';
import { deviceRouter } from '~/server/api/routers/iot/device';
import { createCallerFactory } from '~/server/api/trpc';

import { documentedLiveStartEntry } from '../../lib/prop-accounts/liveStartFixtures';
import {
    assertUserScopedWhere,
    createFakeDatabase,
    FakeDatabaseError,
    type FakeRow,
    insertedColumnValues,
    type IssuedQuery,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    accountCreateInput,
    accountRow,
    accountUpdateInput,
    callerFor,
    copyGroupRow,
    defined,
    deletesFrom,
    errorShapeOf,
    eventRow,
    feeRow,
    IDS,
    insertsInto,
    INSTANT_ENTRY,
    mutationRejection,
    planKeyFields,
    propWrites,
    rejectionOf,
    type Responder,
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
vi.mock('~/lib/observability/logger', () => ({ captureError: vi.fn() }));
vi.mock('~/lib/observability/rate-limit', () => ({
    isWithinRateLimit: vi.fn(() => Promise.resolve(true)),
}));

const captureErrorMock = vi.mocked(captureError);

const UNREADABLE_IDS = {
    corruptOptIns: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    corruptPersonalRules: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    removedFirm: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    unknownSerial: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const;

interface UnreadableCase {
    readonly name: string;
    readonly readIssues: readonly AccountReadIssue[];
    readonly row: FakeRow;
}

const UNREADABLE_CASES: readonly UnreadableCase[] = [
    {
        name: 'corrupt opt-ins',
        readIssues: [
            {
                kind: AccountReadIssueKind.UnresolvablePlan,
                reason: UnresolvedPlanReason.CorruptOptIns,
            },
        ],
        row: accountRow({
            id: UNREADABLE_IDS.corruptOptIns,
            label: 'Corrupt opt-ins',
            opt_ins: { takesFundedReset: 'yes' },
        }),
    },
    {
        name: 'a removed firm id',
        readIssues: [
            {
                kind: AccountReadIssueKind.UnresolvablePlan,
                reason: UnresolvedPlanReason.UnknownFirm,
            },
        ],
        row: accountRow({
            firm_id: 'gone-firm',
            id: UNREADABLE_IDS.removedFirm,
            label: 'Removed firm',
        }),
    },
    {
        name: 'an unknown plan serial',
        readIssues: [
            {
                kind: AccountReadIssueKind.UnresolvablePlan,
                reason: UnresolvedPlanReason.UnknownPlanSerial,
            },
        ],
        row: accountRow({
            id: UNREADABLE_IDS.unknownSerial,
            label: 'Unknown serial',
            plan_serial: 'retired-plan',
        }),
    },
    {
        name: 'corrupt personal rules',
        readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        row: accountRow({
            id: UNREADABLE_IDS.corruptPersonalRules,
            label: 'Corrupt personal rules',
            personal_rules: { maxRiskPerTradeCents: 'lots' },
        }),
    },
];

function describedReadIssues(
    account: Parameters<typeof describeAccountReadIssue>[0] & {
        readonly readIssues: readonly AccountReadIssue[];
    },
): null | string {
    return account.readIssues.length === 0
        ? null
        : account.readIssues
              .map((issue) => describeAccountReadIssue(account, issue))
              .join('; ');
}

function eventDetails(queries: readonly IssuedQuery[]) {
    return insertsInto(queries, TABLES.event).flatMap((query) =>
        insertedColumnValues(query, 'detail').map((raw) =>
            readAccountEventDetail(
                typeof raw === 'string' ? JSON.parse(raw) : raw,
            ),
        ),
    );
}

function failingInsert(
    table: string,
    error: FakeDatabaseError,
): (query: IssuedQuery) => ReturnType<ReturnType<typeof tableResponder>> {
    const base = tableResponder();
    return (query) => {
        if (query.text.startsWith(`insert into "${table}"`)) throw error;
        return base(query);
    };
}

function fundedUpdateResponder(
    options: { readonly account?: FakeRow; readonly passes?: FakeRow[] } = {},
): Responder {
    const base = tableResponder({
        [TABLES.account]: [
            options.account ??
                accountRow({
                    funded_on: '2026-09-05',
                    stage: AccountStage.Funded,
                }),
        ],
        [TABLES.event]: [
            eventRow({
                kind: AccountEventKind.Busted,
                occurred_on: '2026-09-10',
            }),
        ],
    });
    return (query) =>
        readTable(query) === TABLES.event &&
        query.params.includes(AccountEventKind.EvalPassed)
            ? (options.passes ?? [])
            : base(query);
}

function instantKeyColumns(): FakeRow {
    const key = planKeyFields(INSTANT_ENTRY);
    return {
        account_size: key.accountSize,
        firm_id: key.firmId,
        plan_serial: key.planSerial,
    };
}

function isCorruptJsonbCase(entry: Pick<UnreadableCase, 'readIssues'>) {
    return entry.readIssues.some(
        (issue) =>
            issue.kind === AccountReadIssueKind.CorruptPersonalRules ||
            (issue.kind === AccountReadIssueKind.UnresolvablePlan &&
                issue.reason === UnresolvedPlanReason.CorruptOptIns),
    );
}

function isPersonalRulesCase(entry: Pick<UnreadableCase, 'readIssues'>) {
    return entry.readIssues.some(
        (issue) => issue.kind === AccountReadIssueKind.CorruptPersonalRules,
    );
}

function zodErrorFields(tree: unknown): string[] {
    const properties: unknown =
        typeof tree === 'object' && tree !== null
            ? Reflect.get(tree, 'properties')
            : undefined;
    return typeof properties === 'object' && properties !== null
        ? Object.keys(properties).toSorted(compareText)
        : [];
}

describe('propAccounts.account', () => {
    it('create inserts the account and its Purchased event for the session user in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const created = await caller.account.create(accountCreateInput());
        expect(created.id).toBe(IDS.account);
        const [accountInsert] = insertsInto(queries, TABLES.account);
        expect(accountInsert).toBeDefined();
        expect(insertedColumnValues(defined(accountInsert), 'user_id')).toEqual(
            [USER_ID],
        );
        expect(insertedColumnValues(defined(accountInsert), 'stage')).toEqual([
            AccountStage.Eval,
        ]);
        const [eventInsert] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(eventInsert), 'kind')).toEqual([
            AccountEventKind.Purchased,
        ]);
        expect(
            insertedColumnValues(defined(eventInsert), 'occurred_on'),
        ).toEqual(['2026-09-01']);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('create rejects an invalid plan key before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.account.create(
                accountCreateInput({ planSerial: 'not-a-plan' }),
            ),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('create rejects stage Eval on an instant-funded plan', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const input = accountCreateInput({
            ...planKeyFields(INSTANT_ENTRY),
            stage: AccountStage.Eval,
        });
        await expect(caller.account.create(input)).rejects.toMatchObject({
            code: 'BAD_REQUEST',
        });
        expect(queries).toHaveLength(0);
    });

    it('create maps a duplicate active label (23505) to CONFLICT with a readable message', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            failingInsert(
                TABLES.account,
                new FakeDatabaseError(
                    '23505',
                    'prop_account_user_label_active_idx',
                ),
            ),
        );
        const error = await rejectionOf(
            caller.account.create(accountCreateInput()),
        );
        expect(error).toMatchObject({ code: 'CONFLICT' });
        expect((error as Error).message).toMatch(/label/i);
        expect((error as Error).message).not.toMatch(/insert into/i);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Rollback,
        ]);
    });

    it('maps a stored-date check violation (23514) and an over-long text (22001) to BAD_REQUEST', async () => {
        for (const error of [
            new FakeDatabaseError('23514', 'prop_account_purchased_on_ck'),
            new FakeDatabaseError('22001', 'prop_account'),
        ]) {
            const { caller } = callerFor(
                SIGNED_IN,
                failingInsert(TABLES.account, error),
            );
            const caught = await rejectionOf(
                caller.account.create(accountCreateInput()),
            );
            expect(caught).toMatchObject({ code: 'BAD_REQUEST' });
            expect((caught as Error).message).not.toMatch(/insert into/i);
        }
    });

    it('create rejects a copy group whose members have a different stage', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        copy_group_id: IDS.copyGroup,
                        id: IDS.otherAccount,
                        stage: AccountStage.Funded,
                    }),
                ],
                [TABLES.copyGroup]: [copyGroupRow()],
            }),
        );
        const error = await rejectionOf(
            caller.account.create(
                accountCreateInput({ copyGroupId: IDS.copyGroup }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MixedStageCopyGroup),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create with a roundId inserts into an open round of the caller that still fits the budget', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 16_500 })],
            }),
        );
        await caller.account.create(
            accountCreateInput({ roundId: VIDEO_IDS.round }),
        );
        const [accountInsert] = insertsInto(queries, TABLES.account);
        expect(
            insertedColumnValues(defined(accountInsert), 'round_id'),
        ).toEqual([VIDEO_IDS.round]);
    });

    it('create rejects a foreign roundId and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [VIDEO_TABLES.round]: [] }),
        );
        const error = await rejectionOf(
            caller.account.create(
                accountCreateInput({ roundId: VIDEO_IDS.round }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create rejects a closed round and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [VIDEO_TABLES.round]: [
                    roundRow({ status: RoundStatus.Closed }),
                ],
            }),
        );
        const error = await rejectionOf(
            caller.account.create(
                accountCreateInput({ roundId: VIDEO_IDS.round }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RoundClosed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('create rejects a round whose budget is already spent, and inserts with an explicit override', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 150_000 })],
            }),
        );
        const error = await rejectionOf(
            caller.account.create(
                accountCreateInput({ roundId: VIDEO_IDS.round }),
            ),
        );
        const shape = errorShapeOf(error);
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
            overrideCaller.account.create(
                accountCreateInput({
                    overrideRoundBudget: true,
                    roundId: VIDEO_IDS.round,
                }),
            ),
        ).resolves.toMatchObject({ id: IDS.account });
    });

    it('create rejects a round whose spend equals its budget exactly, and accepts one cent below, with the override, or with no budget', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 100_000 })],
            }),
        );
        const error = await rejectionOf(
            caller.account.create(
                accountCreateInput({ roundId: VIDEO_IDS.round }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RoundBudgetExceeded),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const { caller: belowCaller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 99_999 })],
            }),
        );
        await expect(
            belowCaller.account.create(
                accountCreateInput({ roundId: VIDEO_IDS.round }),
            ),
        ).resolves.toMatchObject({ id: IDS.account });
        const { caller: overrideCaller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 100_000 })],
            }),
        );
        await expect(
            overrideCaller.account.create(
                accountCreateInput({
                    overrideRoundBudget: true,
                    roundId: VIDEO_IDS.round,
                }),
            ),
        ).resolves.toMatchObject({ id: IDS.account });
        const { caller: unbudgetedCaller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 5_000_000 })],
                [VIDEO_TABLES.round]: [roundRow({ budget_cents: null })],
            }),
        );
        const unbudgetedInput = accountCreateInput({
            roundId: VIDEO_IDS.round,
        });
        await expect(
            unbudgetedCaller.account.create(unbudgetedInput),
        ).resolves.toMatchObject({ id: IDS.account });
    });

    it('update checks the round only when the roundId actually changes', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ round_id: VIDEO_IDS.round })],
            }),
        );
        await caller.account.update(
            accountUpdateInput({ label: 'Renamed', roundId: VIDEO_IDS.round }),
        );
        const roundReads = queries.filter(
            (query) => readTable(query) === VIDEO_TABLES.round,
        );
        expect(roundReads).toHaveLength(0);
    });

    it('update rejects moving into a round whose budget is already spent, unless overridden', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 150_000 })],
            }),
        );
        const error = await rejectionOf(
            caller.account.update(
                accountUpdateInput({ roundId: VIDEO_IDS.round }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RoundBudgetExceeded),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('update takes no stage or status input', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        for (const extra of [
            { stage: AccountStage.Funded },
            { status: 'busted' },
        ]) {
            await expect(
                caller.account.update(accountUpdateInput(extra)),
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        }
        expect(queries).toHaveLength(0);
    });

    it('update writes an Edited event with the field diff in the same transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.update(
            accountUpdateInput({ label: 'Renamed', tags: ['mff'] }),
        );
        const steps = queries
            .map((query) => query.text)
            .filter(
                (text) =>
                    ['begin', 'commit'].includes(text) ||
                    text.startsWith(`update "${TABLES.account}"`) ||
                    text.startsWith(`insert into "${TABLES.event}"`),
            )
            .map((text) => text.split(' ').slice(0, 3).join(' '));
        expect(steps).toEqual([
            'begin',
            `update "${TABLES.account}" set`,
            `insert into "${TABLES.event}"`,
            'commit',
        ]);
        const [eventInsert] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(eventInsert), 'kind')).toEqual([
            AccountEventKind.Edited,
        ]);
        const [detail] = eventDetails(queries);
        expect(detail?.changes).toEqual(
            expect.arrayContaining([
                { field: 'label', from: 'Eval one', to: 'Renamed' },
                { field: 'tags', from: '[]', to: '["mff"]' },
            ]),
        );
        expect(detail?.changes).toHaveLength(2);
        const load = queries.find(
            (query) => readTable(query) === TABLES.account,
        );
        expect(load?.text).toMatch(/ for update$/);
        expect(updatesOf(queries, TABLES.account)[0]?.text).toMatch(
            /where \("sadranl_prop_account"\."id" = \$\d+ and "sadranl_prop_account"\."user_id" = \$\d+\)/,
        );
    });

    it('update moves the stored Purchased event with a changed purchase date, in the same transaction', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.event]: [] }),
        );
        await caller.account.update(
            accountUpdateInput({ purchasedOn: '2026-08-01' }),
        );
        const [eventUpdate, ...extra] = updatesOf(queries, TABLES.event);
        expect(extra).toHaveLength(0);
        assertUserScopedWhere(defined(eventUpdate), USER_ID);
        expect(eventUpdate?.text).toMatch(/set "occurred_on" = \$1/);
        expect(eventUpdate?.params).toEqual(
            expect.arrayContaining([
                '2026-08-01',
                IDS.account,
                AccountEventKind.Purchased,
            ]),
        );
        const order = queries
            .map((query) => query.text)
            .filter(
                (text) =>
                    ['begin', 'commit'].includes(text) ||
                    text.startsWith('update') ||
                    text.startsWith('insert'),
            )
            .map((text) => text.split(' ').slice(0, 2).join(' '));
        expect(order).toEqual([
            'begin',
            `update "${TABLES.account}"`,
            `update "${TABLES.event}"`,
            `insert into`,
            'commit',
        ]);
    });

    it('update leaves the Purchased event alone when the purchase date is unchanged', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.update(accountUpdateInput({ label: 'Renamed' }));
        expect(updatesOf(queries, TABLES.event)).toHaveLength(0);
    });

    it('update rejects a purchase date after the first recorded lifecycle event and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.event]: [
                    eventRow({
                        kind: AccountEventKind.EvalPassed,
                        occurred_on: '2026-09-10',
                    }),
                ],
            }),
        );
        const error = await rejectionOf(
            caller.account.update(
                accountUpdateInput({ purchasedOn: '2026-09-15' }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/2026-09-10/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const boundary = queries.find(
            (query) => readTable(query) === TABLES.event,
        );
        assertUserScopedWhere(defined(boundary), USER_ID);
        expect(boundary?.params).toEqual(
            expect.arrayContaining([
                AccountEventKind.Purchased,
                AccountEventKind.Edited,
            ]),
        );
    });

    it.each([
        {
            dates: { fundedOn: '2026-08-31' },
            field: 'fundedOn',
            name: 'a funded date before the purchase date',
        },
        {
            dates: { firstFundedTradeOn: '2026-08-31' },
            field: 'firstFundedTradeOn',
            name: 'a first funded trade before the purchase date',
        },
        {
            dates: {
                firstFundedTradeOn: '2026-09-09',
                fundedOn: '2026-09-10',
            },
            field: 'firstFundedTradeOn',
            name: 'a first funded trade before the funded date',
        },
    ])(
        'create and update reject $name before touching the database',
        async ({ dates, field }) => {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            for (const call of [
                () =>
                    caller.account.create(
                        accountCreateInput({
                            ...dates,
                            stage: AccountStage.Funded,
                        }),
                    ),
                () => caller.account.update(accountUpdateInput(dates)),
            ]) {
                const shape = errorShapeOf(await rejectionOf(call()));
                expect(shape.data.code).toBe('BAD_REQUEST');
                expect(zodErrorFields(shape.data.zodError)).toEqual([field]);
            }
            expect(queries).toHaveLength(0);
        },
    );

    it('update rejects moving the funded date of an account created as Funded past its first lifecycle event, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            fundedUpdateResponder(),
        );
        const error = await rejectionOf(
            caller.account.update(
                accountUpdateInput({ fundedOn: '2026-09-12' }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/2026-09-12.*2026-09-10/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const eventQueries = queries.filter(
            (issued) => readTable(issued) === TABLES.event,
        );
        expect(eventQueries).toHaveLength(2);
        for (const query of eventQueries) {
            assertUserScopedWhere(query, USER_ID);
            expect(query.params).toContain(IDS.account);
        }
    });

    it('update rejects a plan change that implies a pass after the first lifecycle event, and writes nothing', async () => {
        const instantAccount = accountRow({
            ...instantKeyColumns(),
            funded_on: '2026-09-12',
            stage: AccountStage.Funded,
        });
        const { caller, queries } = callerFor(
            SIGNED_IN,
            fundedUpdateResponder({ account: instantAccount }),
        );
        const update = caller.account.update(
            accountUpdateInput({ fundedOn: '2026-09-12' }),
        );
        const shape = errorShapeOf(await rejectionOf(update));
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it.each([
        {
            account: accountRow({
                funded_on: '2026-09-05',
                stage: AccountStage.Funded,
            }),
            fundedOn: '2026-09-10',
            name: 'a funded date on the first lifecycle event',
            passes: [],
            planKey: {},
        },
        {
            account: accountRow({
                funded_on: '2026-09-05',
                stage: AccountStage.Funded,
            }),
            fundedOn: '2026-09-12',
            name: 'a later funded date once the pass itself is recorded',
            passes: [
                eventRow({
                    kind: AccountEventKind.EvalPassed,
                    occurred_on: '2026-09-04',
                }),
            ],
            planKey: {},
        },
        {
            account: accountRow({ funded_on: '2026-09-05' }),
            fundedOn: '2026-09-12',
            name: 'a later funded date on an account still in its evaluation',
            passes: [],
            planKey: {},
        },
        {
            account: accountRow({
                ...instantKeyColumns(),
                funded_on: '2026-09-05',
                stage: AccountStage.Funded,
            }),
            fundedOn: '2026-09-12',
            name: 'a later funded date on an instant-funded plan',
            passes: [],
            planKey: planKeyFields(INSTANT_ENTRY),
        },
    ])(
        'update accepts $name',
        async ({ account, fundedOn, passes, planKey }) => {
            const { caller } = callerFor(
                SIGNED_IN,
                fundedUpdateResponder({ account, passes }),
            );
            await expect(
                caller.account.update(
                    accountUpdateInput({ ...planKey, fundedOn }),
                ),
            ).resolves.toBeDefined();
        },
    );

    it('accepts funded dates on the purchase date', async () => {
        const { caller } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.account.update(
                accountUpdateInput({
                    firstFundedTradeOn: '2026-09-01',
                    fundedOn: '2026-09-01',
                }),
            ),
        ).resolves.toBeDefined();
    });

    it('update with a foreign replacesAccountId throws NOT_FOUND and writes nothing', async () => {
        const base = tableResponder();
        const { caller, queries } = callerFor(SIGNED_IN, (query) =>
            readTable(query) === TABLES.account && query.text.includes(' in (')
                ? []
                : base(query),
        );
        await expect(
            caller.account.update(
                accountUpdateInput({ replacesAccountId: IDS.otherAccount }),
            ),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('update with a foreign copyGroupId throws NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.copyGroup]: [] }),
        );
        await expect(
            caller.account.update(
                accountUpdateInput({ copyGroupId: IDS.copyGroup }),
            ),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('update into a copy group whose members have another stage is a typed CONFLICT', async () => {
        const base = tableResponder();
        const { caller, queries } = callerFor(SIGNED_IN, (query) =>
            readTable(query) === TABLES.account &&
            /"copy_group_id" = \$\d+/.test(query.text)
                ? [
                      accountRow({
                          copy_group_id: IDS.copyGroup,
                          id: IDS.otherAccount,
                          stage: AccountStage.Funded,
                      }),
                  ]
                : base(query),
        );
        const error = await rejectionOf(
            caller.account.update(
                accountUpdateInput({ copyGroupId: IDS.copyGroup }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.MixedStageCopyGroup),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('dates an Edited event no earlier than the purchase date', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ purchased_on: '2099-01-01' })],
            }),
        );
        await caller.account.archive({ id: IDS.account });
        const [eventInsert] = insertsInto(queries, TABLES.event);
        expect(
            insertedColumnValues(defined(eventInsert), 'occurred_on'),
        ).toEqual(['2099-01-01']);
    });

    it('update still fails loud on a corrupt stored opt-in as PRECONDITION_FAILED, not as an input error', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ opt_ins: { takesFundedReset: 'yes' } }),
                ],
            }),
        );
        const renamed = accountUpdateInput({ label: 'Renamed' });
        const shape = errorShapeOf(
            await rejectionOf(caller.account.update(renamed)),
        );
        expect(shape.data.code).toBe('PRECONDITION_FAILED');
        expect(shape.data.zodError).toBeNull();
        expect(shape.message).toMatch(/stored account "Eval one"/);
        expect(shape.message).not.toMatch(/\b(remove|delete)/i);
        expect(shape.message).toContain(STORED_DATA_OWNER_REPAIR);
        expect(shape.message).not.toMatch(/add it again|new account/i);
        expect(shape.data.propRejection).toEqual({
            lifecycleRejection: null,
            limit: null,
            quota: null,
            reason: PropStoredRecordRejection.InvalidStoredRecord,
            record: PropRecord.Account,
            recordId: IDS.account,
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('list returns every account when some cannot be read, and flags each of those read-only with a typed reason', async () => {
        captureErrorMock.mockClear();
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow(),
                    ...UNREADABLE_CASES.map((entry) => entry.row),
                ],
            }),
        );
        const listed = await caller.account.list({});
        expect(listed.map((account) => account.id)).toEqual([
            IDS.account,
            ...UNREADABLE_CASES.map((entry) => entry.row.id),
        ]);
        expect(listed.map((account) => account.readIssues)).toEqual([
            [],
            ...UNREADABLE_CASES.map((entry) => entry.readIssues),
        ]);
        const byId = new Map(listed.map((account) => [account.id, account]));
        expect(byId.get(UNREADABLE_IDS.corruptOptIns)?.optIns).toEqual(
            NO_PLAN_OPT_INS,
        );
        expect(
            byId.get(UNREADABLE_IDS.corruptPersonalRules)?.personalRules,
        ).toBeNull();
        expect(byId.get(IDS.account)?.personalRules).toEqual({});
        expect(byId.get(UNREADABLE_IDS.removedFirm)?.firmId).toBe('gone-firm');
        expect(byId.get(UNREADABLE_IDS.unknownSerial)?.planSerial).toBe(
            'retired-plan',
        );
        expect(
            listed.map(
                (account) => resolvePlanKey(trackedAccountOf(account)).kind,
            ),
        ).toEqual([
            PlanKeyResolutionKind.Resolved,
            PlanKeyResolutionKind.Unresolved,
            PlanKeyResolutionKind.Unresolved,
            PlanKeyResolutionKind.Unresolved,
            PlanKeyResolutionKind.Resolved,
        ]);
        expect(captureErrorMock).toHaveBeenCalledTimes(2);
        const reported = captureErrorMock.mock.calls.map(
            ([error, context]) => ({
                accountId: context?.fields?.accountId,
                isStoredRecordError:
                    error instanceof PropInvalidStoredRecordError,
                tag: context?.tag,
            }),
        );
        expect(reported).toEqual([
            {
                accountId: UNREADABLE_IDS.corruptOptIns,
                isStoredRecordError: true,
                tag: 'prop-accounts:corrupt-row',
            },
            {
                accountId: UNREADABLE_IDS.corruptPersonalRules,
                isStoredRecordError: true,
                tag: 'prop-accounts:corrupt-row',
            },
        ]);
    });

    it('the accounts table shows every listed account with an unresolvable plan read-only, placeholder opt-ins included', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: UNREADABLE_CASES.filter(
                    (entry) => !isPersonalRulesCase(entry),
                ).map((entry) => entry.row),
            }),
        );
        const listed = await caller.account.list({});
        const rows = buildAccountListRows(listed, []);
        expect(rows.map((row) => row.isReadOnly)).toEqual([true, true, true]);
        expect(rows.map((row) => row.planIssue)).toEqual(
            listed.map((account) =>
                account.readIssues
                    .map((issue) =>
                        describeAccountReadIssue(
                            trackedAccountOf(account),
                            issue,
                        ),
                    )
                    .join('; '),
            ),
        );
        expect(rows[0]?.planIssue).toMatch(/stored opt-ins .* are not valid/);
    });

    it.each(UNREADABLE_CASES.filter((entry) => !isPersonalRulesCase(entry)))(
        'get returns an account with $name flagged read-only instead of throwing',
        async ({ readIssues, row }) => {
            const { caller } = callerFor(
                SIGNED_IN,
                tableResponder({ [TABLES.account]: [row] }),
            );
            const account = await caller.account.get({ id: String(row.id) });
            expect(account.id).toBe(row.id);
            expect(account.readIssues).toEqual(readIssues);
            expect(resolvePlanKey(trackedAccountOf(account)).kind).toBe(
                PlanKeyResolutionKind.Unresolved,
            );
        },
    );

    it('get keeps failing loud on corrupt personal rules, so the editor never shows unreadable caps as unset', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        opt_ins: { takesFundedReset: 'yes' },
                        personal_rules: { maxRiskPerTradeCents: 'lots' },
                    }),
                ],
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(caller.account.get({ id: IDS.account })),
        );
        expect(shape.data.code).toBe('PRECONDITION_FAILED');
        expect(shape.message).toMatch(/stored account "Eval one"/);
        expect(shape.data.propRejection).toEqual({
            lifecycleRejection: null,
            limit: null,
            quota: null,
            reason: PropStoredRecordRejection.InvalidStoredRecord,
            record: PropRecord.Account,
            recordId: IDS.account,
        });
    });

    it('get fails loud on a row whose only problem is corrupt personal rules, though its plan resolves', async () => {
        const { row } = defined(UNREADABLE_CASES.find(isPersonalRulesCase));
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [row] }),
        );
        const listed = await caller.account.list({});
        const first = trackedAccountOf(defined(listed[0]));
        expect(resolvePlanKey(first).kind).toBe(PlanKeyResolutionKind.Resolved);
        const pending = caller.account.get({ id: String(row.id) });
        const shape = errorShapeOf(await rejectionOf(pending));
        expect(shape.data.code).toBe('PRECONDITION_FAILED');
        expect(shape.message).toMatch(
            /stored account "Corrupt personal rules"/,
        );
        expect(shape.message).toContain(STORED_DATA_OWNER_REPAIR);
        expect(shape.message).not.toMatch(/add it again|new account/i);
        expect(shape.data.propRejection).toEqual({
            lifecycleRejection: null,
            limit: null,
            quota: null,
            reason: PropStoredRecordRejection.InvalidStoredRecord,
            record: PropRecord.Account,
            recordId: row.id,
        });
    });

    it('list flags a stored jsonb null in opt_ins as corrupt opt-ins, never as none taken', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ opt_ins: null })],
            }),
        );
        const [listed] = await caller.account.list({});
        expect(listed?.readIssues).toEqual([
            {
                kind: AccountReadIssueKind.UnresolvablePlan,
                reason: UnresolvedPlanReason.CorruptOptIns,
            },
        ]);
        expect(listed?.optIns).toEqual(NO_PLAN_OPT_INS);
        const tracked = trackedAccountOf(defined(listed));
        expect(resolvePlanKey(tracked).kind).toBe(
            PlanKeyResolutionKind.Unresolved,
        );
    });

    it('the accounts table marks every listed account with a read issue read-only and alerts on each unresolvable plan', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow(),
                    ...UNREADABLE_CASES.map((entry) => entry.row),
                ],
            }),
        );
        const listed = await caller.account.list({});
        const rows = buildAccountListRows(listed, []);
        expect(rows.map((row) => row.isReadOnly)).toEqual([
            false,
            ...UNREADABLE_CASES.map(() => true),
        ]);
        expect(rows.map((row) => row.planIssue)).toEqual(
            listed.map((account) =>
                describedReadIssues(trackedAccountOf(account)),
            ),
        );
        const alerted = portfolioAlerts({
            accounts: listed,
            accountStates: NO_ACCOUNT_STATES,
            copyGroups: [],
            payouts: [],
            rulebook: DEFAULT_RULEBOOK,
            snapshots: [],
            today: '2026-09-25',
        })
            .filter((alert) => alert.kind === AlertKind.UnresolvablePlan)
            .map((alert) => alert.subject);
        expect(alerted).toHaveLength(
            UNREADABLE_CASES.filter((entry) => !isPersonalRulesCase(entry))
                .length,
        );
        expect(
            alerted.some(
                (subject) =>
                    'accountId' in subject &&
                    subject.accountId === UNREADABLE_IDS.corruptOptIns,
            ),
        ).toBe(true);
    });

    it.each(UNREADABLE_CASES)(
        'unarchive restores an account with $name, returns the restored row flagged and reports it once',
        async ({ readIssues, row }) => {
            captureErrorMock.mockClear();
            const archived = {
                ...row,
                archived_at: new Date('2026-09-10T00:00:00Z'),
            };
            const base = tableResponder({ [TABLES.account]: [archived] });
            const { caller, queries } = callerFor(SIGNED_IN, (query) =>
                query.text.startsWith(`update "${TABLES.account}"`)
                    ? [{ ...row, archived_at: null }]
                    : base(query),
            );
            const account = await caller.account.unarchive({
                id: String(row.id),
            });
            expect(account.id).toBe(row.id);
            expect(account.archivedAt).toBeNull();
            expect(account.readIssues).toEqual(readIssues);
            expect(account.personalRules).toEqual(
                isPersonalRulesCase({ readIssues }) ? null : {},
            );
            expect(captureErrorMock).toHaveBeenCalledTimes(
                isCorruptJsonbCase({ readIssues }) ? 1 : 0,
            );
            const [update] = updatesOf(queries, TABLES.account);
            assertUserScopedWhere(defined(update), USER_ID);
            expect(update?.text).toMatch(/set "archived_at" = \$1/);
            expect(update?.text).toMatch(/\sreturning\s/i);
            expect(
                queries.filter((query) => readTable(query) === TABLES.account),
            ).toHaveLength(1);
        },
    );

    it('remove works on accounts whose stored jsonb is corrupt, the removed one and the ones replacing it', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({ opt_ins: { takesFundedReset: 'yes' } }),
                ],
            }),
        );
        await expect(
            caller.account.remove({ id: IDS.account }),
        ).resolves.toEqual({ ok: true });
        const [removal] = deletesFrom(queries, TABLES.account);
        assertUserScopedWhere(defined(removal), USER_ID);
        expect(removal?.params).toContain(IDS.account);
        expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
    });

    it('archive works on an account whose stored jsonb is corrupt', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        personal_rules: { maxRiskPerTradeCents: 'lots' },
                    }),
                ],
            }),
        );
        const archived = await caller.account.archive({ id: IDS.account });
        expect(archived.id).toBe(IDS.account);
        const [update] = updatesOf(queries, TABLES.account);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.text).toMatch(/set "archived_at" = \$1/);
    });

    it('update writes nothing when no field changed', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const result = await caller.account.update(accountUpdateInput());
        expect(result.id).toBe(IDS.account);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('update re-checks the stored stage against a changed plan key', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const input = accountUpdateInput(planKeyFields(INSTANT_ENTRY));
        const error = await rejectionOf(caller.account.update(input));
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(
                PropMutationRejection.StageNotOfferedByPlan,
                LifecycleRejection.EvalOnInstantFundedPlan,
            ),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('archive sets archived_at on the owned account and logs the edit', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.archive({ id: IDS.account });
        const [update] = updatesOf(queries, TABLES.account);
        expect(update?.text).toMatch(/set "archived_at" = \$1/);
        expect(Date.parse(String(update?.params[0]))).not.toBeNaN();
        expect(eventDetails(queries)[0]?.changes[0]?.field).toBe('archivedAt');
    });

    it('list hides archived accounts unless asked and filters by stage and firm', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.list({});
        await caller.account.list({
            firmId: planKeyFields(INSTANT_ENTRY).firmId,
            includeArchived: true,
            stage: AccountStage.Funded,
        });
        const [hidden, all] = queries;
        expect(hidden?.text).toMatch(/"archived_at" is null/);
        expect(all?.text).not.toMatch(/"archived_at" is null/);
        expect(all?.text).toMatch(/"stage" = \$\d+/);
        expect(all?.text).toMatch(/"firm_id" = \$\d+/);
        expect(all?.params).toContain(AccountStage.Funded);
    });

    it('remove clears replacement links to the account before deleting it, in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.remove({ id: IDS.account });
        const writes = propWrites(queries).map((query) => query.text);
        const clearIndex = writes.findIndex((text) =>
            text.startsWith(
                'update "sadranl_prop_account" set "replaces_account_id" = $1',
            ),
        );
        const removalIndex = writes.findIndex((text) =>
            text.startsWith(`delete from "${TABLES.account}"`),
        );
        expect(clearIndex).toBeGreaterThanOrEqual(0);
        expect(removalIndex).toBeGreaterThan(clearIndex);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('importMany rejects 201 rows before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) =>
            accountCreateInput({ label: `Row ${index}` }),
        );
        await expect(caller.account.importMany(rows)).rejects.toMatchObject({
            code: 'BAD_REQUEST',
        });
        expect(queries).toHaveLength(0);
    });

    it('importMany inserts every row in one statement and rolls everything back on failure', async () => {
        const ok = callerFor(SIGNED_IN, tableResponder());
        await ok.caller.account.importMany([
            accountCreateInput({ label: 'One' }),
            accountCreateInput({ label: 'Two' }),
        ]);
        const [accountInsert, ...extra] = insertsInto(
            ok.queries,
            TABLES.account,
        );
        expect(extra).toHaveLength(0);
        expect(insertedColumnValues(defined(accountInsert), 'label')).toEqual([
            'One',
            'Two',
        ]);

        const failing = callerFor(
            SIGNED_IN,
            failingInsert(
                TABLES.event,
                new FakeDatabaseError('23514', 'prop_account_event_ck'),
            ),
        );
        await expect(
            failing.caller.account.importMany([
                accountCreateInput({ label: 'One' }),
                accountCreateInput({ label: 'Two' }),
            ]),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(transactionSteps(failing.queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Rollback,
        ]);
    });

    it('importMany rejects two rows with the same label', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const error = await rejectionOf(
            caller.account.importMany([
                accountCreateInput({ label: 'Same' }),
                accountCreateInput({ label: 'Same' }),
            ]),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.DuplicateImportLabel),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('importMany still enforces the round budget for a row that does not override it, even when another row targeting the same round does', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.fee]: [feeRow({ amount_cents: 150_000 })],
            }),
        );
        const error = await rejectionOf(
            caller.account.importMany([
                accountCreateInput({
                    label: 'Overridden',
                    overrideRoundBudget: true,
                    roundId: VIDEO_IDS.round,
                }),
                accountCreateInput({
                    label: 'Not overridden',
                    roundId: VIDEO_IDS.round,
                }),
            ]),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.RoundBudgetExceeded),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });
});

describe('the tRPC error formatter', () => {
    it('keeps the error shape of other routers unchanged', async () => {
        const { database } = createFakeDatabase(() => []);
        const caller = createCallerFactory(deviceRouter)({
            db: database,
            headers: new Headers(),
            session: null as never,
        });
        const unauthorized = errorShapeOf(
            await rejectionOf(caller.getDevices()),
            deviceRouter,
        );
        const { stack, ...data } = unauthorized.data;
        expect(typeof stack).toBe('string');
        expect({ ...unauthorized, data }).toEqual({
            code: -32_001,
            data: {
                code: 'UNAUTHORIZED',
                httpStatus: 401,
                zodError: null,
            },
            message: 'UNAUTHORIZED',
        });
        const invalid = errorShapeOf(
            await rejectionOf(caller.getDevice({} as never)),
            deviceRouter,
        );
        expect(Object.keys(invalid.data).toSorted(compareText)).toEqual([
            'code',
            'httpStatus',
            'stack',
            'zodError',
        ]);
        expect(invalid.data.code).toBe('BAD_REQUEST');
        expect(invalid.data.zodError).not.toBeNull();
    });

    it('adds no rejection data to a prop error that is not a rejection', async () => {
        const { caller } = callerFor(SIGNED_IN, () => []);
        const shape = errorShapeOf(
            await rejectionOf(caller.account.get({ id: IDS.account })),
        );
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(Object.keys(shape.data)).not.toContain('propRejection');
    });
});

describe('propAccounts.account live start range', () => {
    const live = documentedLiveStartEntry();
    const liveKey = planKeyFields(live);
    const outOfRangeCents = Math.round((live.highestStart + 10_000) * 100);
    const inRangeCents = Math.round(live.lowestStart * 100);

    function liveCreateInput(overrides: Record<string, unknown> = {}) {
        return accountCreateInput({
            ...liveKey,
            fundedOn: '2026-09-01',
            label: 'Live one',
            liveStartBalanceCents: outOfRangeCents,
            stage: AccountStage.Live,
            ...overrides,
        });
    }

    function liveStoredResponder(): Responder {
        return tableResponder({
            [TABLES.account]: [
                accountRow({
                    account_size: liveKey.accountSize,
                    firm_id: liveKey.firmId,
                    funded_on: '2026-09-01',
                    label: 'Live one',
                    live_start_balance_cents: inRangeCents,
                    plan_serial: liveKey.planSerial,
                    stage: AccountStage.Live,
                }),
            ],
        });
    }

    it('create rejects a live start outside the documented range with a typed rejection, reading nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const error = await rejectionOf(
            caller.account.create(
                liveCreateInput({ replacesAccountId: IDS.otherAccount }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ImplausibleSnapshot),
        );
        expect(shape.message).toContain('"Live one"');
        expect(shape.message).toContain('A live account after');
        expect(shape.message).not.toContain(String.fromCodePoint(0x20_14));
        expect(queries).toHaveLength(0);
    });

    it('create stores a live start inside the documented range', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.create(
            liveCreateInput({ liveStartBalanceCents: inRangeCents }),
        );
        const [accountInsert] = insertsInto(queries, TABLES.account);
        expect(
            insertedColumnValues(
                defined(accountInsert),
                'live_start_balance_cents',
            ),
        ).toEqual([inRangeCents]);
    });

    it('create rejects a live start outside the documented range before the live stage too, reading nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const error = await rejectionOf(
            caller.account.create(
                liveCreateInput({ stage: AccountStage.Funded }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ImplausibleSnapshot),
        );
        expect(shape.message).toContain('A live account after');
        expect(queries).toHaveLength(0);
    });

    it('create stores a live start inside the documented range before the live stage', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.create(
            liveCreateInput({
                liveStartBalanceCents: inRangeCents,
                stage: AccountStage.Funded,
            }),
        );
        expect(insertsInto(queries, TABLES.account)).toHaveLength(1);
    });

    it('create stores an account without a live start before the live stage', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.account.create(
            liveCreateInput({
                liveStartBalanceCents: null,
                stage: AccountStage.Funded,
            }),
        );
        expect(insertsInto(queries, TABLES.account)).toHaveLength(1);
    });

    it('update rejects a live start outside the documented range on a funded account, so a later move live cannot carry it, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        account_size: liveKey.accountSize,
                        firm_id: liveKey.firmId,
                        funded_on: '2026-09-01',
                        label: 'Funded one',
                        plan_serial: liveKey.planSerial,
                        stage: AccountStage.Funded,
                    }),
                ],
            }),
        );
        const error = await rejectionOf(
            caller.account.update(
                accountUpdateInput({
                    ...liveKey,
                    fundedOn: '2026-09-01',
                    label: 'Funded one',
                    liveStartBalanceCents: outOfRangeCents,
                }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ImplausibleSnapshot),
        );
        expect(shape.message).toContain('"Funded one"');
        expect(propWrites(queries)).toHaveLength(0);
        const reads = queries.filter((query) => readTable(query) !== null);
        for (const query of reads) assertUserScopedWhere(query, USER_ID);
    });

    it('update rejects a live start outside the documented range on a live account, writes nothing and reads only the owner rows', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, liveStoredResponder());
        const error = await rejectionOf(
            caller.account.update(
                accountUpdateInput({
                    ...liveKey,
                    fundedOn: '2026-09-01',
                    label: 'Live one',
                    liveStartBalanceCents: outOfRangeCents,
                }),
            ),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ImplausibleSnapshot),
        );
        expect(shape.message).toContain('"Live one"');
        expect(shape.message).toContain('A live account after');
        expect(propWrites(queries)).toHaveLength(0);
        const reads = queries.filter((query) => readTable(query) !== null);
        expect(reads.length).toBeGreaterThan(0);
        for (const query of reads) assertUserScopedWhere(query, USER_ID);
    });

    it('update keeps accepting a live start inside the documented range', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, liveStoredResponder());
        await caller.account.update(
            accountUpdateInput({
                ...liveKey,
                fundedOn: '2026-09-01',
                label: 'Live renamed',
                liveStartBalanceCents: inRangeCents,
            }),
        );
        expect(updatesOf(queries, TABLES.account)).toHaveLength(1);
    });

    it('importMany names the account with the live start outside the documented range by its label and reads nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const error = await rejectionOf(
            caller.account.importMany([
                liveCreateInput({
                    label: 'Live fine',
                    liveStartBalanceCents: inRangeCents,
                }),
                liveCreateInput({
                    label: 'Live off',
                    replacesAccountId: IDS.otherAccount,
                }),
            ]),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ImplausibleSnapshot),
        );
        expect(shape.message).toContain('Account "Live off"');
        expect(shape.message).not.toContain('Row ');
        expect(shape.message).not.toContain('"Live fine"');
        expect(queries).toHaveLength(0);
    });

    it('importMany rejects a funded row whose live start is outside the documented range', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const error = await rejectionOf(
            caller.account.importMany([
                liveCreateInput({
                    label: 'Funded off',
                    stage: AccountStage.Funded,
                }),
            ]),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('Account "Funded off"');
        expect(queries).toHaveLength(0);
    });
});
