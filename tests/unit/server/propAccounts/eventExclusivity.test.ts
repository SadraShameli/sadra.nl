import { describe, expect, it, vi } from 'vitest';

import {
    liveExclusivityPreviewOf,
    type LivePreviewAccount,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/liveExclusivityPreview';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    readAccountEventDetail,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    type LiveExclusivityPolicy,
    NO_PLAN_OPT_INS,
    PolicySourceKind,
    PolicyVerification,
    SimAccountEffect,
    UnknownCooldown,
} from '~/lib/prop-calculator';
import {
    PropMutationRejection,
    PropQuota,
} from '~/lib/schemas/propAccountOutputs';
import {
    eventRecordSchema,
    MAX_CONFIRMED_EXCLUSIVITY_ACCOUNTS,
} from '~/lib/schemas/propAccounts';

import { documentedLiveStartEntry } from '../../lib/prop-accounts/liveStartFixtures';
import {
    assertInsertedForUser,
    assertUserScopedWhere,
    type FakeRow,
    insertedColumnValues,
    type IssuedQuery,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    accountRow,
    callerFor,
    defined,
    errorShapeOf,
    IDS,
    insertsInto,
    isCount,
    ledgerOnlyAccountRow,
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

const DOCUMENTED_LIVE = documentedLiveStartEntry();
const DOCUMENTED_LIVE_START_CENTS = Math.round(
    DOCUMENTED_LIVE.lowestStart * 100,
);
const KEY = planKeyFields(DOCUMENTED_LIVE);

const FIRST_SIBLING = IDS.otherAccount;
const SECOND_SIBLING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THIRD_SIBLING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_USER = 'user-other';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class ExclusivityStub extends FirmAccountPolicy {
    constructor(
        private readonly effect: SimAccountEffect,
        private readonly source: LiveExclusivityPolicy['source'],
    ) {
        super();
    }

    override liveExclusivityFor(): LiveExclusivityPolicy {
        return {
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: this.effect,
            source: this.source,
        };
    }
}

const DORMANT_WHILE_LIVE = new ExclusivityStub(
    SimAccountEffect.Dormant,
    CONFIRMED_SOURCE,
);

function detailOf(query: IssuedQuery) {
    const [raw] = insertedColumnValues(query, 'detail');
    const stored: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return readAccountEventDetail(stored);
}

function eventInserts(queries: readonly IssuedQuery[]) {
    return insertsInto(queries, TABLES.event).map((query) => ({
        accountId: insertedColumnValues(query, 'account_id')[0],
        detail: detailOf(query),
        kind: insertedColumnValues(query, 'kind')[0],
        query,
    }));
}

function isAccountListQuery(query: IssuedQuery): boolean {
    return (
        readTable(query) === TABLES.account &&
        !isCount(query) &&
        query.text.includes(' order by ')
    );
}

function lockedAccountIds(queries: readonly IssuedQuery[]): string[] {
    return queries
        .filter(
            (query) =>
                readTable(query) === TABLES.account &&
                !isCount(query) &&
                query.text.endsWith(' for update'),
        )
        .flatMap((query) =>
            [IDS.account, FIRST_SIBLING, SECOND_SIBLING, THIRD_SIBLING].filter(
                (id) => query.params.includes(id),
            ),
        );
}

function movedAccount(overrides: FakeRow = {}): FakeRow {
    return accountRow({
        account_size: KEY.accountSize,
        firm_id: KEY.firmId,
        funded_on: '2026-09-01',
        label: 'Going live',
        live_start_balance_cents: DOCUMENTED_LIVE_START_CENTS,
        plan_serial: KEY.planSerial,
        stage: AccountStage.Funded,
        ...overrides,
    });
}

function recordMovedLive(
    caller: ReturnType<typeof callerFor>['caller'],
    confirmedExclusivityAccountIds?: string[],
) {
    return caller.event.record({
        accountId: IDS.account,
        ...(confirmedExclusivityAccountIds !== undefined && {
            confirmedExclusivityAccountIds,
        }),
        kind: AccountEventKind.MovedLive,
        occurredOn: '2026-09-21',
    });
}

function responderFor(
    accounts: readonly FakeRow[],
    counts: Readonly<Record<string, number>> = {},
): Responder {
    const base = tableResponder({}, counts);
    return (query) => {
        if (isAccountListQuery(query)) {
            return accounts.filter(
                (row) =>
                    query.params.includes(row.user_id) &&
                    (row.firm_id === null ||
                        query.params.includes(row.firm_id)) &&
                    row.archived_at === null,
            );
        }
        return readTable(query) === TABLES.account && !isCount(query)
            ? accounts.filter(
                  (row) =>
                      query.params.includes(row.id) &&
                      query.params.includes(row.user_id),
              )
            : base(query);
    };
}

function siblingAccount(id: string, overrides: FakeRow = {}): FakeRow {
    return accountRow({
        account_size: KEY.accountSize,
        firm_id: KEY.firmId,
        id,
        label: `Sibling ${id.slice(0, 4)}`,
        plan_serial: KEY.planSerial,
        stage: AccountStage.Eval,
        ...overrides,
    });
}

async function withPolicy<T>(
    policy: FirmAccountPolicy,
    run: () => Promise<T>,
): Promise<T> {
    const firm = DOCUMENTED_LIVE.firm as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return await run();
    } finally {
        firm.accountPolicy = original;
    }
}

function withPolicyNow<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = DOCUMENTED_LIVE.firm as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('eventRecordSchema confirmedExclusivityAccountIds', () => {
    const base = {
        accountId: IDS.account,
        kind: AccountEventKind.MovedLive,
        occurredOn: '2026-09-21',
    };

    it('accepts a bounded list of distinct other accounts on a MovedLive and none by default', () => {
        expect(eventRecordSchema.safeParse(base).success).toBe(true);
        expect(
            eventRecordSchema.safeParse({
                ...base,
                confirmedExclusivityAccountIds: [FIRST_SIBLING, SECOND_SIBLING],
            }).success,
        ).toBe(true);
    });

    it('rejects the field on any other kind', () => {
        for (const kind of [
            AccountEventKind.Busted,
            AccountEventKind.EvalPassed,
            AccountEventKind.Closed,
        ]) {
            expect(
                eventRecordSchema.safeParse({
                    ...base,
                    confirmedExclusivityAccountIds: [FIRST_SIBLING],
                    kind,
                }).success,
                kind,
            ).toBe(false);
        }
    });

    it('rejects the account itself, a duplicate, a non-uuid and a list past the bound', () => {
        for (const confirmedExclusivityAccountIds of [
            [IDS.account],
            [FIRST_SIBLING, FIRST_SIBLING],
            ['not-a-uuid'],
            Array.from(
                { length: MAX_CONFIRMED_EXCLUSIVITY_ACCOUNTS + 1 },
                (_, index) =>
                    `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            ),
        ]) {
            expect(
                eventRecordSchema.safeParse({
                    ...base,
                    confirmedExclusivityAccountIds,
                }).success,
            ).toBe(false);
        }
    });

    it('accepts a list exactly at the bound', () => {
        expect(
            eventRecordSchema.safeParse({
                ...base,
                confirmedExclusivityAccountIds: Array.from(
                    { length: MAX_CONFIRMED_EXCLUSIVITY_ACCOUNTS },
                    (_, index) =>
                        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
                ),
            }).success,
        ).toBe(true);
    });
});

describe('propAccounts.event.record with confirmed exclusivity effects', () => {
    it('suspends each confirmed sibling in the same transaction: locks, user-scoped updates and one event each', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING),
                siblingAccount(SECOND_SIBLING, { stage: AccountStage.Funded }),
            ]),
        );
        await withPolicy(DORMANT_WHILE_LIVE, () =>
            recordMovedLive(caller, [FIRST_SIBLING, SECOND_SIBLING]),
        );
        expect(new Set(lockedAccountIds(queries))).toEqual(
            new Set([FIRST_SIBLING, IDS.account, SECOND_SIBLING]),
        );
        const updates = updatesOf(queries, TABLES.account);
        expect(updates).toHaveLength(3);
        for (const update of updates) assertUserScopedWhere(update, USER_ID);
        for (const id of [FIRST_SIBLING, SECOND_SIBLING]) {
            const update = defined(
                updates.find((candidate) => candidate.params.includes(id)),
            );
            expect(update.params).toEqual(
                expect.arrayContaining([AccountStatus.Suspended]),
            );
        }
        const inserted = eventInserts(queries);
        expect(inserted).toHaveLength(3);
        for (const row of inserted) assertInsertedForUser(row.query, USER_ID);
        const live = defined(
            inserted.find((row) => row.kind === AccountEventKind.MovedLive),
        );
        expect(live.accountId).toBe(IDS.account);
        const suspensions = inserted.filter(
            (row) => row.kind === AccountEventKind.Suspended,
        );
        expect(new Set(suspensions.map((row) => row.accountId))).toEqual(
            new Set([FIRST_SIBLING, SECOND_SIBLING]),
        );
        expect(suspensions).toHaveLength(2);
        for (const row of suspensions) {
            expect(row.detail.note).toContain('Going live');
            expect(row.detail.changes).toEqual([
                {
                    field: 'status',
                    from: AccountStatus.Active,
                    to: AccountStatus.Suspended,
                },
            ]);
        }
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('counts the sibling events against the event quota: one more than the headroom rolls back and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor(
                [
                    movedAccount(),
                    siblingAccount(FIRST_SIBLING),
                    siblingAccount(SECOND_SIBLING),
                ],
                { [TABLES.event]: 49_998 },
            ),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING, SECOND_SIBLING]),
                ),
            ),
        );
        expect(shape.data.code).toBe('TOO_MANY_REQUESTS');
        expect(shape.data.propRejection?.quota).toBe(PropQuota.Events);
        expect(propWrites(queries)).toHaveLength(0);
        expect(transactionSteps(queries).at(-1)).toBe(TransactionStep.Rollback);
    });

    it('accepts exactly the quota headroom for the live event plus its siblings', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor(
                [
                    movedAccount(),
                    siblingAccount(FIRST_SIBLING),
                    siblingAccount(SECOND_SIBLING),
                ],
                { [TABLES.event]: 49_997 },
            ),
        );
        await withPolicy(DORMANT_WHILE_LIVE, () =>
            recordMovedLive(caller, [FIRST_SIBLING, SECOND_SIBLING]),
        );
        expect(insertsInto(queries, TABLES.event)).toHaveLength(3);
    });

    it('rejects the whole transaction when one id is not in the verified Suspend set: a sibling at another firm', async () => {
        const otherFirm = defined(
            ALL_FIRMS.find((firm) => firm.id !== KEY.firmId),
        );
        const otherKey = planKeyFields({
            firm: otherFirm,
            plan: defined(otherFirm.plans[0]),
        });
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING),
                siblingAccount(SECOND_SIBLING, {
                    account_size: otherKey.accountSize,
                    firm_id: otherKey.firmId,
                    plan_serial: otherKey.planSerial,
                }),
            ]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING, SECOND_SIBLING]),
                ),
            ),
        );
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(shape.message).toContain(SECOND_SIBLING);
        expect(propWrites(queries)).toHaveLength(0);
        expect(transactionSteps(queries).at(-1)).toBe(TransactionStep.Rollback);
    });

    it.each([
        ['Suspended', { status: AccountStatus.Suspended }],
        ['Busted', { status: AccountStatus.Busted }],
        ['Closed', { status: AccountStatus.Closed }],
    ])(
        'rejects a confirmed %s sibling with the one typed exclusivity reason, whatever its lifecycle state, and writes nothing',
        async (_name, overrides) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                responderFor([
                    movedAccount(),
                    siblingAccount(FIRST_SIBLING),
                    siblingAccount(SECOND_SIBLING, overrides),
                ]),
            );
            const shape = errorShapeOf(
                await rejectionOf(
                    withPolicy(DORMANT_WHILE_LIVE, () =>
                        recordMovedLive(caller, [
                            FIRST_SIBLING,
                            SECOND_SIBLING,
                        ]),
                    ),
                ),
            );
            expect(shape.data.propRejection).toEqual(
                mutationRejection(
                    PropMutationRejection.ExclusivityNotConfirmed,
                ),
            );
            expect(shape.message).toContain(SECOND_SIBLING);
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it('refuses a MovedLive that sends no confirmed ids while the verified policy suspends an Active sibling, and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([movedAccount(), siblingAccount(FIRST_SIBLING)]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () => recordMovedLive(caller)),
            ),
        );
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(shape.message).toContain(FIRST_SIBLING);
        expect(propWrites(queries)).toHaveLength(0);
        expect(transactionSteps(queries).at(-1)).toBe(TransactionStep.Rollback);
    });

    it('refuses a MovedLive that confirms one of two Active siblings the verified policy suspends and names the one left out', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING),
                siblingAccount(SECOND_SIBLING, { stage: AccountStage.Funded }),
            ]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING]),
                ),
            ),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(shape.message).toContain(SECOND_SIBLING);
        expect(shape.message).not.toContain(FIRST_SIBLING);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('does not require a sibling the verified policy leaves alone: archived, busted, suspended, live, at another firm or only flagged', async () => {
        const archivedOn = new Date('2026-09-10T00:00:00Z');
        const otherFirm = defined(
            ALL_FIRMS.find((firm) => firm.id !== KEY.firmId),
        );
        const otherKey = planKeyFields({
            firm: otherFirm,
            plan: defined(otherFirm.plans[0]),
        });
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING, { archived_at: archivedOn }),
                siblingAccount(SECOND_SIBLING, {
                    status: AccountStatus.Busted,
                }),
                siblingAccount(THIRD_SIBLING, { stage: AccountStage.Live }),
                siblingAccount('cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
                    status: AccountStatus.Suspended,
                }),
                siblingAccount('dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
                    account_size: otherKey.accountSize,
                    firm_id: otherKey.firmId,
                    plan_serial: otherKey.planSerial,
                }),
            ]),
        );
        await withPolicy(DORMANT_WHILE_LIVE, () => recordMovedLive(caller));
        expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
        const flagOnly = new ExclusivityStub(
            SimAccountEffect.UpgradedAccountOnHold,
            CONFIRMED_SOURCE,
        );
        const flagged = callerFor(
            SIGNED_IN,
            responderFor([movedAccount(), siblingAccount(FIRST_SIBLING)]),
        );
        await withPolicy(flagOnly, () => recordMovedLive(flagged.caller));
        expect(insertsInto(flagged.queries, TABLES.event)).toHaveLength(1);
    });

    it('reads the siblings user-scoped, once, and never writes for a sibling the caller did not confirm', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING),
                siblingAccount(SECOND_SIBLING, { user_id: OTHER_USER }),
            ]),
        );
        await rejectionOf(
            withPolicy(DORMANT_WHILE_LIVE, () => recordMovedLive(caller)),
        );
        const listings = queries.filter(isAccountListQuery);
        expect(listings).toHaveLength(1);
        for (const query of listings) assertUserScopedWhere(query, USER_ID);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('reads the required Suspend set under row locks, with FOR UPDATE like the confirmed ids, before any write', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING),
                siblingAccount(SECOND_SIBLING, { stage: AccountStage.Funded }),
            ]),
        );
        await withPolicy(DORMANT_WHILE_LIVE, () =>
            recordMovedLive(caller, [FIRST_SIBLING, SECOND_SIBLING]),
        );
        const listings = queries.filter(isAccountListQuery);
        expect(listings).toHaveLength(1);
        expect(
            listings.every((query) => query.text.endsWith(' for update')),
        ).toBe(true);
        for (const query of listings) assertUserScopedWhere(query, USER_ID);
        const lockIndex = queries.findIndex(
            (query) =>
                query.text.endsWith(' for update') &&
                query.params.includes(FIRST_SIBLING),
        );
        const listIndex = queries.indexOf(defined(listings[0]));
        const firstWriteIndex = queries.findIndex(
            (query) =>
                query.text.startsWith('update') ||
                query.text.startsWith('insert'),
        );
        expect(lockIndex).toBeGreaterThanOrEqual(0);
        expect(listIndex).toBeLessThan(firstWriteIndex);
    });

    it('rejects an archived sibling: the verified policy suspends open accounts only', async () => {
        const archivedOn = new Date('2026-09-10T00:00:00Z');
        const archived = siblingAccount(FIRST_SIBLING, {
            archived_at: archivedOn,
        });
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([movedAccount(), archived]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING]),
                ),
            ),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects a sibling that is itself Live: the verified policy suspends sim and eval accounts only', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING, { stage: AccountStage.Live }),
            ]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING]),
                ),
            ),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it("never reaches another user's account: it reads as not found and writes nothing", async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING),
                siblingAccount(SECOND_SIBLING, { user_id: OTHER_USER }),
            ]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING, SECOND_SIBLING]),
                ),
            ),
        );
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ReferenceNotOwned),
        );
        expect(propWrites(queries)).toHaveLength(0);
        const reads = queries.filter(
            (query) => readTable(query) === TABLES.account && !isCount(query),
        );
        for (const query of reads) assertUserScopedWhere(query, USER_ID);
    });

    it('rejects every confirmed id while the firm policy is unverified, which is every real firm today', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([movedAccount(), siblingAccount(FIRST_SIBLING)]),
        );
        const shape = errorShapeOf(
            await rejectionOf(recordMovedLive(caller, [FIRST_SIBLING])),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects every confirmed id when the account moving live is ledger only and has no plan policy to read', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                ledgerOnlyAccountRow({ firm_id: KEY.firmId }),
                siblingAccount(FIRST_SIBLING),
            ]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING]),
                ),
            ),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects an id when the verified effect only flags the sibling, which is no lifecycle change', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([movedAccount(), siblingAccount(FIRST_SIBLING)]),
        );
        const flagOnly = new ExclusivityStub(
            SimAccountEffect.UpgradedAccountOnHold,
            CONFIRMED_SOURCE,
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(flagOnly, () =>
                    recordMovedLive(caller, [FIRST_SIBLING]),
                ),
            ),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ExclusivityNotConfirmed),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects a sibling dated before its purchase, whole-transaction, before any write', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING, { purchased_on: '2026-09-25' }),
            ]),
        );
        const shape = errorShapeOf(
            await rejectionOf(
                withPolicy(DORMANT_WHILE_LIVE, () =>
                    recordMovedLive(caller, [FIRST_SIBLING]),
                ),
            ),
        );
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('keeps today behaviour when the field is omitted or empty and the verified policy suspends no sibling: one event, one account update, only the moved account locked', async () => {
        for (const confirmed of [undefined, []]) {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                responderFor([movedAccount()]),
            );
            await withPolicy(DORMANT_WHILE_LIVE, () =>
                recordMovedLive(caller, confirmed),
            );
            expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
            expect(updatesOf(queries, TABLES.account)).toHaveLength(1);
            expect(lockedAccountIds(queries)).toEqual([IDS.account]);
        }
    });

    it('records a plain move live while the firm policy is unverified, which is every real firm today, even with active siblings', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([
                movedAccount(),
                siblingAccount(FIRST_SIBLING),
                siblingAccount(SECOND_SIBLING, { stage: AccountStage.Funded }),
            ]),
        );
        await recordMovedLive(caller);
        expect(insertsInto(queries, TABLES.event)).toHaveLength(1);
        expect(updatesOf(queries, TABLES.account)).toHaveLength(1);
    });

    it('rejects the field on another kind before touching the database', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            responderFor([movedAccount()]),
        );
        await rejectionOf(
            caller.event.record({
                accountId: IDS.account,
                confirmedExclusivityAccountIds: [FIRST_SIBLING],
                kind: AccountEventKind.Busted,
                occurredOn: '2026-09-21',
            }),
        );
        expect(queries).toHaveLength(0);
    });
});

describe('the preview and the router agree on which siblings a MovedLive suspends', () => {
    interface Candidate {
        readonly listed: Partial<LivePreviewAccount>;
        readonly name: string;
        readonly row: FakeRow;
    }

    const otherFirm = defined(ALL_FIRMS.find((firm) => firm.id !== KEY.firmId));
    const otherKey = planKeyFields({
        firm: otherFirm,
        plan: defined(otherFirm.plans[0]),
    });
    const archivedOn = new Date('2026-09-10T00:00:00Z');

    const CANDIDATES: readonly Candidate[] = [
        { listed: {}, name: 'an active eval', row: {} },
        {
            listed: { stage: AccountStage.Funded },
            name: 'an active funded account',
            row: { stage: AccountStage.Funded },
        },
        {
            listed: { stage: AccountStage.Live },
            name: 'a live account',
            row: { stage: AccountStage.Live },
        },
        {
            listed: { status: AccountStatus.Busted },
            name: 'a busted account',
            row: { status: AccountStatus.Busted },
        },
        {
            listed: { status: AccountStatus.Suspended },
            name: 'a suspended account',
            row: { status: AccountStatus.Suspended },
        },
        {
            listed: { archivedAt: archivedOn },
            name: 'an archived account',
            row: { archived_at: archivedOn },
        },
        {
            listed: {
                accountSize: otherKey.accountSize,
                firmId: otherKey.firmId,
                planSerial: otherKey.planSerial,
            },
            name: 'an account at another firm',
            row: {
                account_size: otherKey.accountSize,
                firm_id: otherKey.firmId,
                plan_serial: otherKey.planSerial,
            },
        },
        {
            listed: {
                planLabel: 'Hand typed plan',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            },
            name: 'a ledger-only account at the same firm',
            row: ledgerOnlyAccountRow({
                firm_id: KEY.firmId,
                id: FIRST_SIBLING,
                plan_label: 'Hand typed plan',
                stage: AccountStage.Eval,
            }),
        },
        {
            listed: {
                externalFirmId: 'external-firm',
                firmId: null,
                planLabel: 'Hand typed plan',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            },
            name: 'a ledger-only account at an external firm',
            row: ledgerOnlyAccountRow({
                external_firm_id: 'external-firm',
                firm_id: null,
                id: FIRST_SIBLING,
                plan_label: 'Hand typed plan',
                stage: AccountStage.Eval,
            }),
        },
    ];

    const MOVED_LISTED: LivePreviewAccount = {
        accountSize: KEY.accountSize,
        archivedAt: null,
        externalFirmId: null,
        firmId: KEY.firmId,
        id: IDS.account,
        label: 'Going live',
        optIns: NO_PLAN_OPT_INS,
        planLabel: null,
        planSerial: KEY.planSerial,
        readIssues: [],
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
    };

    function listedOf(candidate: Candidate, id: string): LivePreviewAccount {
        return {
            ...MOVED_LISTED,
            stage: AccountStage.Eval,
            ...candidate.listed,
            id,
            label: candidate.name,
        };
    }

    it('offers a sibling in the preview exactly when the router accepts it', async () => {
        const offeredByName = new Map<string, boolean>();
        const acceptedByName = new Map<string, boolean>();
        for (const candidate of CANDIDATES) {
            const row = siblingAccount(FIRST_SIBLING, candidate.row);
            const preview = withPolicyNow(DORMANT_WHILE_LIVE, () =>
                liveExclusivityPreviewOf(
                    [MOVED_LISTED, listedOf(candidate, FIRST_SIBLING)],
                    IDS.account,
                ),
            );
            offeredByName.set(
                candidate.name,
                preview?.confirmedAccountIds.includes(FIRST_SIBLING) ?? false,
            );
            const { caller } = callerFor(
                SIGNED_IN,
                responderFor([movedAccount(), row]),
            );
            acceptedByName.set(
                candidate.name,
                await withPolicy(DORMANT_WHILE_LIVE, async () => {
                    try {
                        await recordMovedLive(caller, [FIRST_SIBLING]);
                        return true;
                    } catch {
                        return false;
                    }
                }),
            );
        }
        expect(acceptedByName).toEqual(offeredByName);
        const offered = offeredByName.values().toArray();
        expect(offered.filter(Boolean)).toHaveLength(3);
        expect(offered.filter((isOffered) => !isOffered)).toHaveLength(6);
    });
});
