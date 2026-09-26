import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { type z } from 'zod';

import { captureError } from '~/lib/observability/logger';
import {
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    type LedgerEventRow,
    LifecycleRejection,
    type PlanKey,
    type PlanKeyInput,
    PortfolioLedger,
    readAccountEventDetail,
    TransitionProvenance,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts';
import {
    MAX_EVENT_LIST_ROWS,
    type OwnedAccount,
    PropAccountRepo,
    PropInvalidStoredRecordError,
} from '~/lib/prop-accounts/server';
import { type FirmId, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import {
    PropLimitRejection,
    PropMutationRejection,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import { accountUpdateSchema } from '~/lib/schemas/propAccounts';
import {
    impliedPassBound,
    resolvedPlanOrThrow,
} from '~/server/api/routers/propAccounts/mutationGuard';

import { documentedLiveStartEntry } from '../../lib/prop-accounts/liveStartFixtures';
import {
    assertUserScopedWhere,
    createFakeDatabase,
    type FakeRow,
    insertedColumnValues,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    accountRow,
    accountUpdateInput,
    callerFor,
    defined,
    errorShapeOf,
    eventRow,
    IDS,
    insertsInto,
    INSTANT_ENTRY,
    isCount,
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

function fundedResponder(
    options: { readonly account?: FakeRow; readonly passes?: FakeRow[] } = {},
): Responder {
    const base = tableResponder({
        [TABLES.account]: [
            options.account ??
                accountRow({
                    funded_on: '2026-09-15',
                    stage: AccountStage.Funded,
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

const DOCUMENTED_LIVE = documentedLiveStartEntry();
const DOCUMENTED_LIVE_START_CENTS = Math.round(
    DOCUMENTED_LIVE.lowestStart * 100,
);
const UNDOCUMENTED_LIVE_START_CENTS = Math.round(
    (DOCUMENTED_LIVE.highestStart + 10_000) * 100,
);

function fundedOnDocumentedLivePlan(
    liveStartBalanceCents: number,
    stage: AccountStage = AccountStage.Funded,
): FakeRow {
    const key = planKeyFields(DOCUMENTED_LIVE);
    return accountRow({
        account_size: key.accountSize,
        firm_id: key.firmId,
        funded_on: '2026-09-01',
        label: 'Stored before the check',
        live_start_balance_cents: liveStartBalanceCents,
        plan_serial: key.planSerial,
        stage,
    });
}

const captureErrorMock = vi.mocked(captureError);

interface ImpliedPassCase {
    readonly account: FakeRow;
    readonly bound: null | string;
    readonly name: string;
    readonly passOn: null | string;
}

const IMPLIED_PASS_CASES: readonly ImpliedPassCase[] = [
    {
        account: { funded_on: '2026-09-15', stage: AccountStage.Funded },
        bound: '2026-09-15',
        name: 'a Funded row with a funded date and no recorded pass',
        passOn: null,
    },
    {
        account: { stage: AccountStage.Funded },
        bound: '2026-09-01',
        name: 'a Funded row with no funded date and no recorded pass',
        passOn: null,
    },
    {
        account: { stage: AccountStage.Live },
        bound: '2026-09-01',
        name: 'a Live row with no funded date and no recorded pass',
        passOn: null,
    },
    {
        account: { funded_on: '2026-09-15', stage: AccountStage.Live },
        bound: '2026-09-15',
        name: 'a Live row with a funded date and no recorded pass',
        passOn: null,
    },
    {
        account: { funded_on: '2026-09-15', stage: AccountStage.Funded },
        bound: null,
        name: 'a Funded row whose pass is recorded',
        passOn: '2026-09-05',
    },
    {
        account: { stage: AccountStage.Funded },
        bound: null,
        name: 'a Funded row with no funded date whose pass is recorded',
        passOn: '2026-09-05',
    },
    {
        account: { funded_on: '2026-09-15', stage: AccountStage.Eval },
        bound: null,
        name: 'an Eval row with a funded date',
        passOn: null,
    },
    {
        account: { stage: AccountStage.Eval },
        bound: null,
        name: 'an Eval row with no funded date',
        passOn: null,
    },
    {
        account: {
            ...instantKeyColumns(),
            funded_on: '2026-09-15',
            stage: AccountStage.Funded,
        },
        bound: null,
        name: 'an instant-funded row with a funded date',
        passOn: null,
    },
    {
        account: { ...instantKeyColumns(), stage: AccountStage.Funded },
        bound: null,
        name: 'an instant-funded row with no funded date',
        passOn: null,
    },
];

function ledgerImpliedPassOn(
    owned: OwnedAccount,
    passOn: null | string,
): null | string {
    const events: LedgerEventRow[] =
        passOn === null
            ? []
            : [
                  {
                      accountId: owned.id,
                      createdAt: new Date(`${passOn}T12:00:00Z`),
                      id: IDS.event,
                      kind: AccountEventKind.EvalPassed,
                      occurredOn: passOn,
                      userId: USER_ID,
                  },
              ];
    const [entry] = PortfolioLedger.fromRows(USER_ID, {
        accounts: [owned],
        events,
        fees: [],
        payouts: [],
    }).accounts;
    return (
        entry?.transitions.find(
            (transition) =>
                transition.provenance !== TransitionProvenance.Recorded &&
                transition.kind === AccountEventKind.EvalPassed,
        )?.on ?? null
    );
}

function limitParameter(text: string, params: unknown[]): unknown {
    const match = / limit \$(\d+)$/.exec(text);
    return match?.[1] ? params[Number(match[1]) - 1] : undefined;
}

describe('propAccounts.event.record', () => {
    it('rejects an invalid transition with the lifecycle reason and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ stage: AccountStage.Funded })],
            }),
        );
        const error = await rejectionOf(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.EvalPassed,
                occurredOn: '2026-09-21',
            }),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toBe('The account is not in its evaluation');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(
                PropMutationRejection.LifecycleTransition,
                LifecycleRejection.NotEval,
            ),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('uses the plan lifecycle facts: a funded reset on a plan without one is rejected', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        stage: AccountStage.Funded,
                        status: AccountStatus.Busted,
                    }),
                ],
            }),
        );
        const error = await rejectionOf(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.FundedReset,
                occurredOn: '2026-09-21',
            }),
        );
        expect(errorShapeOf(error).data.propRejection).toEqual(
            mutationRejection(
                PropMutationRejection.LifecycleTransition,
                LifecycleRejection.FundedResetNotOffered,
            ),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('locks the account, updates stage and status by id and user id, and inserts the event in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.event.record({
            accountId: IDS.account,
            kind: AccountEventKind.EvalPassed,
            note: 'passed on day 6',
            occurredOn: '2026-09-21',
        });
        const load = queries.find(
            (query) => readTable(query) === TABLES.account && !isCount(query),
        );
        expect(load?.text).toMatch(/ for update$/);
        const [update] = updatesOf(queries, TABLES.account);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([
                AccountStage.Funded,
                AccountStatus.Active,
                IDS.account,
            ]),
        );
        const [insert] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(insert), 'kind')).toEqual([
            AccountEventKind.EvalPassed,
        ]);
        const [raw] = insertedColumnValues(defined(insert), 'detail');
        const detail = readAccountEventDetail(
            typeof raw === 'string' ? JSON.parse(raw) : raw,
        );
        expect(detail.note).toBe('passed on day 6');
        expect(detail.changes).toEqual([
            {
                field: 'stage',
                from: AccountStage.Eval,
                to: AccountStage.Funded,
            },
        ]);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('rejects moving an account live with a stored live start outside the documented range, writes nothing and reads only the owner rows', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            fundedResponder({
                account: fundedOnDocumentedLivePlan(
                    UNDOCUMENTED_LIVE_START_CENTS,
                ),
            }),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                caller.event.record({
                    accountId: IDS.account,
                    kind: AccountEventKind.MovedLive,
                    occurredOn: '2026-09-21',
                }),
            ),
        );
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ImplausibleSnapshot),
        );
        expect(shape.message).toContain('"Stored before the check"');
        expect(shape.message).toContain('A live account after');
        expect(propWrites(queries)).toHaveLength(0);
        const reads = queries.filter((query) => readTable(query) !== null);
        expect(reads.length).toBeGreaterThan(0);
        for (const query of reads) assertUserScopedWhere(query, USER_ID);
    });

    it('moves an account live with a stored live start inside the documented range', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            fundedResponder({
                account: fundedOnDocumentedLivePlan(
                    DOCUMENTED_LIVE_START_CENTS,
                ),
            }),
        );
        await caller.event.record({
            accountId: IDS.account,
            kind: AccountEventKind.MovedLive,
            occurredOn: '2026-09-21',
        });
        const [update] = updatesOf(queries, TABLES.account);
        expect(update?.params).toEqual(
            expect.arrayContaining([AccountStage.Live]),
        );
        expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
    });

    it('records a bust on an account already Live with a live start stored before the range check', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            fundedResponder({
                account: fundedOnDocumentedLivePlan(
                    UNDOCUMENTED_LIVE_START_CENTS,
                    AccountStage.Live,
                ),
            }),
        );
        await caller.event.record({
            accountId: IDS.account,
            kind: AccountEventKind.Busted,
            occurredOn: '2026-09-21',
        });
        const [update] = updatesOf(queries, TABLES.account);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(update?.params).toEqual(
            expect.arrayContaining([AccountStatus.Busted]),
        );
        const [insert] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(insert), 'kind')).toEqual([
            AccountEventKind.Busted,
        ]);
        expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
    });

    it('rejects an event dated before the purchase date and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.event]: [] }),
        );
        const error = await rejectionOf(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.EvalPassed,
                occurredOn: '2026-08-20',
            }),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/2026-09-01/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects an event dated before the latest recorded lifecycle event and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ stage: AccountStage.Funded })],
                [TABLES.event]: [
                    eventRow({
                        kind: AccountEventKind.EvalPassed,
                        occurred_on: '2026-09-20',
                    }),
                ],
            }),
        );
        const error = await rejectionOf(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.Busted,
                occurredOn: '2026-09-15',
            }),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/2026-09-20/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const latest = queries.find(
            (query) => readTable(query) === TABLES.event,
        );
        assertUserScopedWhere(defined(latest), USER_ID);
        expect(latest?.params).toEqual(
            expect.arrayContaining([IDS.account, AccountEventKind.Edited]),
        );
        expect(latest?.text).toMatch(/"kind" <> \$\d+/);
        expect(latest?.text).toMatch(/order by (?:"\w+"\.)?"occurred_on" desc/);
    });

    it('rejects an event before the funded date of an account created as Funded, where the ledger implies the pass', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, fundedResponder());
        const error = await rejectionOf(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.Busted,
                occurredOn: '2026-09-10',
            }),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/2026-09-15/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const passQuery = queries.find(
            (query) =>
                readTable(query) === TABLES.event &&
                query.params.includes(AccountEventKind.EvalPassed),
        );
        assertUserScopedWhere(defined(passQuery), USER_ID);
        expect(passQuery?.params).toContain(IDS.account);
    });

    it('accepts an event on the funded date of an account created as Funded', async () => {
        const { caller } = callerFor(SIGNED_IN, fundedResponder());
        await expect(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.Busted,
                occurredOn: '2026-09-15',
            }),
        ).resolves.toBeDefined();
    });

    it('does not bound events by the funded date once the pass itself is recorded', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            fundedResponder({
                passes: [
                    eventRow({
                        kind: AccountEventKind.EvalPassed,
                        occurred_on: '2026-09-05',
                    }),
                ],
            }),
        );
        await expect(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.Busted,
                occurredOn: '2026-09-10',
            }),
        ).resolves.toBeDefined();
    });

    it('does not bound events by the funded date on an instant-funded plan or an account still in its evaluation', async () => {
        for (const row of [
            accountRow({
                ...instantKeyColumns(),
                funded_on: '2026-09-15',
                stage: AccountStage.Funded,
            }),
            accountRow({ funded_on: '2026-09-15', stage: AccountStage.Eval }),
        ]) {
            const { caller } = callerFor(
                SIGNED_IN,
                fundedResponder({ account: row }),
            );
            await expect(
                caller.event.record({
                    accountId: IDS.account,
                    kind: AccountEventKind.Busted,
                    occurredOn: '2026-09-10',
                }),
            ).resolves.toBeDefined();
        }
    });

    it('accepts an event on the same day as the latest lifecycle event', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [accountRow({ stage: AccountStage.Funded })],
                [TABLES.event]: [
                    eventRow({
                        kind: AccountEventKind.EvalPassed,
                        occurred_on: '2026-09-20',
                    }),
                ],
            }),
        );
        await expect(
            caller.event.record({
                accountId: IDS.account,
                kind: AccountEventKind.Busted,
                occurredOn: '2026-09-20',
            }),
        ).resolves.toBeDefined();
    });

    it('never accepts Edited or Purchased from the client, and needs a note on a bust reversal', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        for (const kind of [
            AccountEventKind.Edited,
            AccountEventKind.Purchased,
            AccountEventKind.BustReversed,
        ]) {
            await expect(
                caller.event.record({
                    accountId: IDS.account,
                    kind: kind as never,
                    occurredOn: '2026-09-21',
                }),
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        }
        expect(queries).toHaveLength(0);
    });
});

describe('implied evaluation pass', () => {
    it.each(IMPLIED_PASS_CASES)(
        'the router bound and the ledger agree for $name',
        async ({ account, bound, passOn }) => {
            const { database } = createFakeDatabase(
                fundedResponder({
                    account: accountRow(account),
                    passes:
                        passOn === null
                            ? []
                            : [
                                  eventRow({
                                      kind: AccountEventKind.EvalPassed,
                                      occurred_on: passOn,
                                  }),
                              ],
                }),
            );
            const repo = new PropAccountRepo(database, USER_ID);
            const owned = await repo.loadOwnedAccountOrThrow(IDS.account);
            const plan = resolvedPlanOrThrow(owned);
            expect(await impliedPassBound(repo, owned, plan)).toBe(bound);
            expect(ledgerImpliedPassOn(owned, passOn)).toBe(bound);
        },
    );
});

describe('resolvedPlanOrThrow', () => {
    it('takes a stored key with its read issues or a validated account update, never a bare plan key', () => {
        type Accepted = Parameters<typeof resolvedPlanOrThrow>[0];
        expectTypeOf<PlanKeyInput>().toExtend<Accepted>();
        expectTypeOf<
            z.output<typeof accountUpdateSchema>
        >().toExtend<Accepted>();
        expectTypeOf<PlanKey>().not.toExtend<Accepted>();
        expectTypeOf<
            Pick<OwnedAccount, 'accountSize' | 'optIns' | 'planSerial'> & {
                readonly firmId: FirmId;
            }
        >().not.toExtend<Accepted>();
    });

    it('resolves a validated account update with no read issues and honours the read issues of a stored key', () => {
        const update = accountUpdateSchema.parse(
            accountUpdateInput({
                ...planKeyFields(INSTANT_ENTRY),
                optIns: NO_PLAN_OPT_INS,
            }),
        );
        expect(resolvedPlanOrThrow(update).id).toEqual(INSTANT_ENTRY.plan.id);
        const stored: PlanKeyInput = {
            ...planKeyFields(INSTANT_ENTRY),
            optIns: NO_PLAN_OPT_INS,
            readIssues: [],
        };
        expect(resolvedPlanOrThrow(stored).id).toEqual(INSTANT_ENTRY.plan.id);
        expect(() =>
            resolvedPlanOrThrow({
                ...stored,
                readIssues: [
                    {
                        kind: AccountReadIssueKind.UnresolvablePlan,
                        reason: UnresolvedPlanReason.CorruptOptIns,
                    },
                ],
            }),
        ).toThrow(
            expect.objectContaining({
                propRejection: mutationRejection(
                    PropMutationRejection.UnresolvablePlan,
                ),
            }),
        );
    });
});

describe('propAccounts.event.list', () => {
    it('returns the user events ordered by occurred_on within the range, with the row limit in the SQL', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        const events = await caller.event.list({
            from: '2026-01-01',
            to: '2026-09-30',
        });
        expect(events).toHaveLength(1);
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.params).toEqual(
            expect.arrayContaining(['2026-01-01', '2026-09-30']),
        );
        expect(list?.text).toMatch(
            /order by (?:"\w+"\.)?"occurred_on" asc, (?:"\w+"\.)?"created_at" asc, (?:"\w+"\.)?"id" asc limit/,
        );
        expect(limitParameter(defined(list).text, defined(list).params)).toBe(
            MAX_EVENT_LIST_ROWS + 1,
        );
    });

    it('rejects a range longer than 3 years before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.event.list({ from: '2020-01-01', to: '2026-01-01' }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('fails loud instead of truncating past the row limit', async () => {
        const rows = Array.from({ length: MAX_EVENT_LIST_ROWS + 1 }, () =>
            eventRow(),
        );
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.event]: rows }),
        );
        const error = await rejectionOf(
            caller.event.list({ from: '2026-01-01', to: '2026-09-30' }),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/narrow/);
        expect(shape.data.propRejection).toEqual({
            lifecycleRejection: null,
            limit: MAX_EVENT_LIST_ROWS,
            quota: null,
            reason: PropLimitRejection.ListTooLarge,
            record: PropRecord.Event,
            recordId: null,
        });
    });

    it('a foreign account id stays inside the user scope and returns nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, () => []);
        const events = await caller.event.list({
            accountId: IDS.otherAccount,
        });
        expect(events).toEqual([]);
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.params).toContain(IDS.otherAccount);
        expect(list?.text).toMatch(/"account_id" = \$\d+/);
    });

    it.each([
        {
            call: (caller: ReturnType<typeof callerFor>['caller']) =>
                caller.event.listForAccount({ id: IDS.account }),
            name: 'listForAccount',
        },
        {
            call: (caller: ReturnType<typeof callerFor>['caller']) =>
                caller.event.list({ from: '2026-01-01', to: '2026-09-30' }),
            name: 'list',
        },
    ])(
        '$name keeps an event whose stored detail is corrupt, with its kind and date, leaves out only the detail and reports it',
        async ({ call }) => {
            captureErrorMock.mockClear();
            const { caller } = callerFor(
                SIGNED_IN,
                tableResponder({
                    [TABLES.event]: [
                        eventRow(),
                        eventRow({
                            detail: { changes: 'none', note: 'kept?' },
                            id: IDS.otherAccount,
                            kind: AccountEventKind.Busted,
                            occurred_on: '2026-09-10',
                        }),
                    ],
                }),
            );
            const events = await call(caller);
            expect(
                events.map((event) => [
                    event.id,
                    event.kind,
                    event.occurredOn,
                    event.detail,
                ]),
            ).toEqual([
                [
                    IDS.event,
                    AccountEventKind.Purchased,
                    '2026-09-01',
                    { changes: [], note: null },
                ],
                [
                    IDS.otherAccount,
                    AccountEventKind.Busted,
                    '2026-09-10',
                    { changes: [], note: null },
                ],
            ]);
            expect(captureErrorMock).toHaveBeenCalledTimes(1);
            const [reported, context] = captureErrorMock.mock.calls[0] ?? [];
            expect(reported).toBeInstanceOf(PropInvalidStoredRecordError);
            expect((reported as Error).message).toMatch(
                /stored account event .*nothing to do.*still counted.*note and change details are left out/i,
            );
            expect(context).toMatchObject({
                fields: { accountId: IDS.account, eventId: IDS.otherAccount },
            });
        },
    );

    it('listForAccount returns the account events in order, scoped by user', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.event.listForAccount({ id: IDS.account });
        const [list] = queries;
        assertUserScopedWhere(defined(list), USER_ID);
        expect(list?.params).toContain(IDS.account);
        expect(list?.text).toMatch(/order by (?:"\w+"\.)?"occurred_on"/);
    });
});
