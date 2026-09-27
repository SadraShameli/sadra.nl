import { describe, expect, it, vi } from 'vitest';

import { ledgerOnlySnapshotRules } from '~/app/(app)/prop-calculator/accounts/_components/snapshotFieldRules';
import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    FirmEngagementStatus,
    INT4_MAX,
    LEDGER_ONLY_SNAPSHOT_FIELD_LIST,
    readAccountEventDetail,
    ReportedPayoutBasis,
    SnapshotField,
    SnapshotFieldRequirement,
    snapshotFieldRules,
    SnapshotInputKind,
    SnapshotSource,
    upgradeChanges,
    upgradeChangeText,
    usdCents,
} from '~/lib/prop-accounts';
import {
    AlertKind,
    PayoutCountMismatchRule,
    PayoutDollarMismatchRule,
} from '~/lib/prop-accounts/alerts';
import { PropAccountRepo } from '~/lib/prop-accounts/server';
import {
    ALL_FIRMS,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import { PropMutationRejection } from '~/lib/schemas/propAccountOutputs';
import {
    accountCreateSchema,
    accountTagsSchema,
} from '~/lib/schemas/propAccounts';

import {
    alertsOf,
    ANY_EVAL_PLAN,
    ledgerOnlyAccountFor,
    paidPayout,
    snapshotFor,
} from '../../lib/prop-accounts/alerts/alertFixtures';
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
    accountCreateInput,
    accountRow,
    accountUpdateInput,
    callerFor,
    copyGroupRow,
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
    type RegistryEntry,
    rejectionOf,
    type Responder,
    SIGNED_IN,
    snapshotRow,
    tableResponder,
    TABLES,
    updatesOf,
    USER_ID,
} from './propRouterHarness';
import {
    externalFirmRow,
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

type RouterCaller = ReturnType<typeof callerFor>['caller'];

const EXTERNAL_FIRM_ID = VIDEO_IDS.externalFirm;
const SECOND_EXTERNAL_FIRM_ID = 'b2222222-2222-4222-8222-222222222223';

function registryEntry(isMatch: (plan: Plan) => boolean): RegistryEntry {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isMatch);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no registry plan matches');
}

const EVAL_ENTRY = registryEntry(
    (plan) => !plan.isInstantFunded && plan.fundedReset === null,
);

function bustRecordedCaller(occurredOn: string) {
    const events = [
        eventRow({ kind: AccountEventKind.Busted, occurred_on: occurredOn }),
    ];
    const responder = ledgerOnlyResponder(ledgerOnlyRow(), {
        [TABLES.event]: events,
    });
    return callerFor(SIGNED_IN, withoutRecordedPass(responder));
}

function ledgerOnlyInput(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 150_000,
        dashboardConvention: accountCreateInput().dashboardConvention,
        firmId: FirmId.Mffu,
        label: 'Rapid 150K',
        planLabel: 'Rapid 150K',
        purchasedOn: '2026-09-01',
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly as const,
        ...overrides,
    };
}

function ledgerOnlyResponder(
    row: FakeRow = ledgerOnlyRow(),
    overrides: Readonly<Record<string, FakeRow[]>> = {},
): Responder {
    return tableResponder({
        [TABLES.account]: [row],
        [VIDEO_TABLES.externalFirm]: [externalFirmRow()],
        ...overrides,
    });
}

function ledgerOnlyRow(overrides: FakeRow = {}): FakeRow {
    return accountRow({
        account_size: 150_000,
        firm_id: FirmId.Mffu,
        label: 'Rapid 150K',
        plan_label: 'Rapid 150K',
        plan_serial: null,
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly,
        ...overrides,
    });
}

function ledgerOnlyUpdate() {
    return {
        accountSize: 150_000,
        copyGroupId: null,
        dashboardConvention: accountCreateInput().dashboardConvention,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: IDS.account,
        label: 'Rapid 150K',
        liveStartBalanceCents: null,
        notes: null,
        personalRules: {},
        planLabel: 'Rapid 150K',
        purchasedOn: '2026-09-01',
        replacesAccountId: null,
        tags: [],
        tracking: AccountTracking.LedgerOnly as const,
    };
}

function snapshotFieldSample(input: SnapshotInputKind): number | string {
    switch (input) {
        case SnapshotInputKind.Count: {
            return 1;
        }
        case SnapshotInputKind.Date: {
            return '2026-09-15';
        }
        case SnapshotInputKind.Money: {
            return 100_000;
        }
    }
}

function upgradeCaller(stored: FakeRow, snapshots: FakeRow[] = []) {
    return callerFor(SIGNED_IN, (query) => {
        if (isCount(query)) return [{ count: 0 }];
        return query.text.startsWith(`update "${TABLES.account}"`)
            ? [accountRow({ stage: AccountStage.Eval })]
            : ledgerOnlyResponder(stored, {
                  [TABLES.snapshot]: snapshots,
              })(query);
    });
}

function withoutRecordedPass(responder: Responder): Responder {
    return (query) =>
        readTable(query) === TABLES.event &&
        query.params.includes(AccountEventKind.EvalPassed)
            ? []
            : responder(query);
}

describe('the account create schema as a tracked union', () => {
    it('carries no tags shape shim: the tags schema is its own export and the union still defaults and checks tags', () => {
        expect('shape' in accountCreateSchema).toBe(false);
        expect(accountTagsSchema.safeParse(['funded', 'copy']).success).toBe(
            true,
        );
        expect(accountTagsSchema.safeParse([' ']).success).toBe(false);
        expect(
            accountCreateSchema.safeParse({ ...ledgerOnlyInput(), tags: [' '] })
                .success,
        ).toBe(false);
        expect(accountCreateSchema.parse(ledgerOnlyInput()).tags).toEqual([]);
    });
});

describe('propAccounts.account with ledger-only accounts', () => {
    it('creates a ledger-only account at a listed firm with any positive whole-dollar size, a plan label, stage and dates', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        const created = await caller.account.create(
            ledgerOnlyInput({ fundedOn: '2026-09-10' }),
        );
        expect(created.tracking).toBe(AccountTracking.LedgerOnly);
        const insert = defined(insertsInto(queries, TABLES.account)[0]);
        expect(insertedColumnValues(insert, 'tracking')).toEqual([
            AccountTracking.LedgerOnly,
        ]);
        expect(insertedColumnValues(insert, 'plan_label')).toEqual([
            'Rapid 150K',
        ]);
        expect(insertedColumnValues(insert, 'account_size')).toEqual([150_000]);
        expect(insertedColumnValues(insert, 'firm_id')).toEqual([FirmId.Mffu]);
        expect(insertedColumnValues(insert, 'plan_serial')).toEqual([null]);
        expect(insertedColumnValues(insert, 'stage')).toEqual([
            AccountStage.Funded,
        ]);
    });

    it.each([123_457, 1, INT4_MAX])(
        'accepts a ledger-only size of %i dollars',
        async (accountSize) => {
            const { caller } = callerFor(SIGNED_IN, ledgerOnlyResponder());
            await expect(
                caller.account.create(ledgerOnlyInput({ accountSize })),
            ).resolves.toMatchObject({ tracking: AccountTracking.LedgerOnly });
        },
    );

    it.each([0, -5, 1.5, INT4_MAX + 1])(
        'rejects a ledger-only size of %d before touching the database',
        async (accountSize) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                ledgerOnlyResponder(),
            );
            await expect(
                caller.account.create(ledgerOnlyInput({ accountSize })),
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
            expect(queries).toHaveLength(0);
        },
    );

    it.each([
        ['no plan label', { planLabel: '' }],
        ['no firm at all', { firmId: null }],
        [
            'both a listed and an external firm',
            { externalFirmId: EXTERNAL_FIRM_ID },
        ],
    ])('rejects a ledger-only account with %s', async (_name, overrides) => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        await expect(
            caller.account.create(ledgerOnlyInput(overrides)),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('creates a ledger-only account at the caller own external firm, read by user inside the transaction', async () => {
        const row = ledgerOnlyRow({
            external_firm_id: EXTERNAL_FIRM_ID,
            firm_id: null,
            plan_label: 'Hola Prime 100K',
        });
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(row),
        );
        await caller.account.create(
            ledgerOnlyInput({
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: null,
                planLabel: 'Hola Prime 100K',
            }),
        );
        const firmRead = defined(
            queries.find(
                (query) => readTable(query) === VIDEO_TABLES.externalFirm,
            ),
        );
        assertUserScopedWhere(firmRead, USER_ID);
        expect(firmRead.params).toContain(EXTERNAL_FIRM_ID);
        const steps = transactionSteps(queries);
        expect(steps).toEqual([TransactionStep.Begin, TransactionStep.Commit]);
        const begin = queries.findIndex(
            (query) => query.text.trim().toLowerCase() === 'begin',
        );
        expect(queries.indexOf(firmRead)).toBeGreaterThan(begin);
        const insert = defined(insertsInto(queries, TABLES.account)[0]);
        expect(insertedColumnValues(insert, 'external_firm_id')).toEqual([
            EXTERNAL_FIRM_ID,
        ]);
    });

    it('rejects an external firm of another user with NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [VIDEO_TABLES.externalFirm]: [],
            }),
        );
        await expect(
            caller.account.create(
                ledgerOnlyInput({
                    externalFirmId: EXTERNAL_FIRM_ID,
                    firmId: null,
                }),
            ),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects account.update moving a ledger-only account to an external firm of another user with NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [VIDEO_TABLES.externalFirm]: [],
            }),
        );
        await expect(
            caller.account.update({
                ...ledgerOnlyUpdate(),
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: null,
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        const firmRead = defined(
            queries.find(
                (query) => readTable(query) === VIDEO_TABLES.externalFirm,
            ),
        );
        assertUserScopedWhere(firmRead, USER_ID);
        expect(firmRead.params).toContain(EXTERNAL_FIRM_ID);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects account.importMany with a ledger-only row at an external firm of another user with NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [VIDEO_TABLES.externalFirm]: [],
            }),
        );
        await expect(
            caller.account.importMany([
                accountCreateInput({ label: 'Modeled one' }),
                ledgerOnlyInput({
                    externalFirmId: EXTERNAL_FIRM_ID,
                    firmId: null,
                    label: 'Ledger one',
                }),
            ]),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        const firmRead = defined(
            queries.find(
                (query) => readTable(query) === VIDEO_TABLES.externalFirm,
            ),
        );
        assertUserScopedWhere(firmRead, USER_ID);
        expect(firmRead.params).toContain(EXTERNAL_FIRM_ID);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('checks account.importMany rows at two distinct external firms with one query, not one per firm', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [VIDEO_TABLES.externalFirm]: [
                    externalFirmRow({ id: EXTERNAL_FIRM_ID }),
                    externalFirmRow({ id: SECOND_EXTERNAL_FIRM_ID }),
                ],
            }),
        );
        await caller.account.importMany([
            ledgerOnlyInput({
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: null,
                label: 'Ledger one',
            }),
            ledgerOnlyInput({
                externalFirmId: SECOND_EXTERNAL_FIRM_ID,
                firmId: null,
                label: 'Ledger two',
            }),
        ]);
        const firmReads = queries.filter(
            (query) => readTable(query) === VIDEO_TABLES.externalFirm,
        );
        expect(firmReads).toHaveLength(1);
    });

    it('refuses account.importMany rows at two distinct external firms when only one is owned, in one query naming exactly those ids and the user id', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [VIDEO_TABLES.externalFirm]: [
                    externalFirmRow({ id: EXTERNAL_FIRM_ID }),
                ],
            }),
        );
        const rows = [
            ledgerOnlyInput({
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: null,
                label: 'Ledger one',
            }),
            ledgerOnlyInput({
                externalFirmId: SECOND_EXTERNAL_FIRM_ID,
                firmId: null,
                label: 'Ledger two',
            }),
        ];
        const shape = errorShapeOf(
            await rejectionOf(caller.account.importMany(rows)),
        );
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.ReferenceNotOwned),
        );
        const firmReads = queries.filter(
            (query) => readTable(query) === VIDEO_TABLES.externalFirm,
        );
        expect(firmReads).toHaveLength(1);
        const [firmRead] = firmReads;
        expect(firmRead?.text).toContain(' in (');
        assertUserScopedWhere(defined(firmRead), USER_ID);
        expect(firmRead?.params).toEqual(
            expect.arrayContaining([
                EXTERNAL_FIRM_ID,
                SECOND_EXTERNAL_FIRM_ID,
                USER_ID,
            ]),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it.each([
        {
            call: (caller: RouterCaller) =>
                caller.account.create(
                    ledgerOnlyInput({
                        externalFirmId: EXTERNAL_FIRM_ID,
                        firmId: null,
                    }),
                ),
            name: 'account.create',
        },
        {
            call: (caller: RouterCaller) =>
                caller.account.update({
                    ...ledgerOnlyUpdate(),
                    externalFirmId: EXTERNAL_FIRM_ID,
                    firmId: null,
                }),
            name: 'account.update',
        },
        {
            call: (caller: RouterCaller) =>
                caller.account.importMany([
                    ledgerOnlyInput({
                        externalFirmId: EXTERNAL_FIRM_ID,
                        firmId: null,
                        label: 'Ledger one',
                    }),
                ]),
            name: 'account.importMany',
        },
        {
            call: (caller: RouterCaller) =>
                caller.round.create({
                    externalFirmId: EXTERNAL_FIRM_ID,
                    label: 'Foreign round',
                    openedOn: '2026-09-01',
                }),
            name: 'round.create',
        },
        {
            call: (caller: RouterCaller) =>
                caller.firmStatement.create({
                    asOf: '2026-09-21',
                    basis: ReportedPayoutBasis.Gross,
                    externalFirmId: EXTERNAL_FIRM_ID,
                    reportedPayoutCents: 1_250_000,
                }),
            name: 'firmStatement.create',
        },
        {
            call: (caller: RouterCaller) =>
                caller.firmEngagement.set({
                    externalFirmId: EXTERNAL_FIRM_ID,
                    sinceOn: '2026-09-21',
                    status: FirmEngagementStatus.Active,
                }),
            name: 'firmEngagement.set',
        },
    ])(
        '$name refuses an external firm of another user the same way as every other write',
        async ({ call }) => {
            const { caller, queries } = callerFor(
                SIGNED_IN,
                ledgerOnlyResponder(ledgerOnlyRow(), {
                    [VIDEO_TABLES.externalFirm]: [],
                }),
            );
            const shape = errorShapeOf(await rejectionOf(call(caller)));
            expect(shape.data.code).toBe('NOT_FOUND');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.ReferenceNotOwned),
            );
            expect(shape.message).toBe(
                'The firm you picked is not one of your firms',
            );
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it.each([
        {
            call: (caller: RouterCaller) =>
                caller.account.create(
                    accountCreateInput({ replacesAccountId: IDS.otherAccount }),
                ),
            message:
                'The account this one replaces is not one of your accounts',
            name: 'account.create with a foreign replaced account',
        },
        {
            call: (caller: RouterCaller) =>
                caller.account.importMany([
                    accountCreateInput({ replacesAccountId: IDS.otherAccount }),
                ]),
            message:
                'The account this one replaces is not one of your accounts',
            name: 'account.importMany with a foreign replaced account',
        },
        {
            call: (caller: RouterCaller) =>
                caller.account.update(
                    accountUpdateInput({ replacesAccountId: IDS.otherAccount }),
                ),
            message:
                'The account this one replaces is not one of your accounts',
            name: 'account.update with a foreign replaced account',
        },
        {
            call: (caller: RouterCaller) =>
                caller.account.create(
                    accountCreateInput({ copyGroupId: IDS.copyGroup }),
                ),
            message: 'The copy group you picked is not one of your copy groups',
            name: 'account.create with a foreign copy group',
        },
        {
            call: (caller: RouterCaller) =>
                caller.account.importMany([
                    accountCreateInput({ copyGroupId: IDS.copyGroup }),
                ]),
            message: 'The copy group you picked is not one of your copy groups',
            name: 'account.importMany with a foreign copy group',
        },
        {
            call: (caller: RouterCaller) =>
                caller.account.update(
                    accountUpdateInput({ copyGroupId: IDS.copyGroup }),
                ),
            message: 'The copy group you picked is not one of your copy groups',
            name: 'account.update with a foreign copy group',
        },
    ])(
        '$name is refused as a reference the user does not own, like a foreign firm',
        async ({ call, message }) => {
            const base = tableResponder({ [TABLES.copyGroup]: [] });
            const { caller, queries } = callerFor(SIGNED_IN, (query) =>
                readTable(query) === TABLES.account &&
                query.text.includes(' in (')
                    ? []
                    : base(query),
            );
            const shape = errorShapeOf(await rejectionOf(call(caller)));
            expect(shape.data.code).toBe('NOT_FOUND');
            expect(shape.data.propRejection).toEqual(
                mutationRejection(PropMutationRejection.ReferenceNotOwned),
            );
            expect(shape.message).toBe(message);
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it('rejects account.update moving the funded date of a Funded ledger-only account after its first recorded lifecycle event and writes nothing', async () => {
        const { caller, queries } = bustRecordedCaller('2026-09-10');
        const update = caller.account.update({
            ...ledgerOnlyUpdate(),
            fundedOn: '2026-09-15',
        });
        const shape = errorShapeOf(await rejectionOf(update));
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toMatch(/2026-09-15/);
        expect(shape.message).toMatch(/2026-09-10/);
        expect(shape.data.propRejection).toEqual(
            mutationRejection(PropMutationRejection.OutOfOrderEvent),
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('accepts account.update moving the funded date of a Funded ledger-only account on or before its first recorded lifecycle event', async () => {
        const { caller, queries } = bustRecordedCaller('2026-09-10');
        await caller.account.update({
            ...ledgerOnlyUpdate(),
            fundedOn: '2026-09-10',
        });
        expect(updatesOf(queries, TABLES.account)).toHaveLength(1);
    });

    it('imports ledger-only rows next to modeled rows', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        await caller.account.importMany([
            accountCreateInput({ label: 'Modeled one' }),
            ledgerOnlyInput({ label: 'Ledger one' }),
        ]);
        const insert = defined(insertsInto(queries, TABLES.account)[0]);
        expect(insertedColumnValues(insert, 'tracking')).toEqual([
            AccountTracking.Modeled,
            AccountTracking.LedgerOnly,
        ]);
        expect(insertedColumnValues(insert, 'plan_label')).toEqual([
            null,
            'Rapid 150K',
        ]);
    });

    it('rejects a ledger-only account joining a copy group with NotModeledForOperation', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        const error = await rejectionOf(
            caller.account.create(
                ledgerOnlyInput({ copyGroupId: IDS.copyGroup }),
            ),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.NotModeledForOperation,
            ),
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects copyGroup.assign of a ledger-only account with NotModeledForOperation and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [TABLES.copyGroup]: [copyGroupRow()],
            }),
        );
        const error = await rejectionOf(
            caller.copyGroup.assign({
                accountId: IDS.account,
                copyGroupId: IDS.copyGroup,
            }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.NotModeledForOperation,
            ),
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('updates a ledger-only account without resolving a plan', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        await caller.account.update({
            ...ledgerOnlyUpdate(),
            accountSize: 175_000,
            planLabel: 'Rapid 175K',
        });
        const update = defined(updatesOf(queries, TABLES.account)[0]);
        assertUserScopedWhere(update, USER_ID);
        expect(update.params).toContain('Rapid 175K');
        expect(update.params).toContain(175_000);
    });

    it('never switches tracking through update: that is what upgradeToModeled is for', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        const error = await rejectionOf(
            caller.account.update({
                ...planKeyFields(EVAL_ENTRY),
                copyGroupId: null,
                dashboardConvention: accountCreateInput().dashboardConvention,
                externalAlias: null,
                firstFundedTradeOn: null,
                fundedOn: null,
                id: IDS.account,
                label: 'Rapid 150K',
                liveStartBalanceCents: null,
                notes: null,
                personalRules: {},
                purchasedOn: '2026-09-01',
                replacesAccountId: null,
                tags: [],
            }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.TrackingChange,
            ),
        });
        expect(propWrites(queries)).toHaveLength(0);
    });
});

describe('propAccounts.snapshot with ledger-only accounts', () => {
    it('stores a balance and an optional floor without plan plausibility', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [TABLES.snapshot]: [snapshotRow({ balance_cents: 1 })],
            }),
        );
        await caller.snapshot.create({
            accountId: IDS.account,
            asOf: '2026-09-21',
            balanceCents: 1,
            dashboardFloorCents: 14_500_000,
            source: SnapshotSource.Manual,
        });
        expect(insertsInto(queries, TABLES.snapshot)).toHaveLength(1);
    });

    it('stores the payout totals of a ledger-only snapshot, so the payout mismatch rules can fire from the stored row', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow(), {
                [TABLES.snapshot]: [snapshotRow()],
            }),
        );
        await caller.snapshot.create({
            accountId: IDS.account,
            asOf: '2026-09-20',
            balanceCents: 15_100_000,
            cumulativePayoutCents: 900_000,
            payoutsTaken: 3,
            source: SnapshotSource.Manual,
        });
        const insert = defined(insertsInto(queries, TABLES.snapshot)[0]);
        const [payoutsTaken] = insertedColumnValues(insert, 'payouts_taken');
        const [cumulativeCents] = insertedColumnValues(
            insert,
            'cumulative_payout_cents',
        );
        expect(payoutsTaken).toBe(3);
        expect(cumulativeCents).toBe(900_000);
        const account = ledgerOnlyAccountFor(ANY_EVAL_PLAN, {
            id: IDS.account,
            stage: AccountStage.Funded,
        });
        const inputs = {
            accounts: [account],
            payouts: [paidPayout(account, { paidOn: '2026-09-10' })],
            snapshots: [
                snapshotFor(account, {
                    asOf: '2026-09-20',
                    cumulativePayoutCents: usdCents(Number(cumulativeCents)),
                    payoutsTaken: Number(payoutsTaken),
                }),
            ],
        };
        expect(
            alertsOf(new PayoutCountMismatchRule(), inputs).map(
                (alert) => alert.kind,
            ),
        ).toEqual([AlertKind.PayoutCountMismatch]);
        expect(
            alertsOf(new PayoutDollarMismatchRule(), inputs).map(
                (alert) => alert.kind,
            ),
        ).toEqual([AlertKind.PayoutDollarMismatch]);
    });

    it.each(Object.values(SnapshotField))(
        'accepts %s from a ledger-only snapshot exactly when the ledger-only snapshot form offers it',
        async (field) => {
            const input = defined(
                snapshotFieldRules(EVAL_ENTRY.plan, AccountStage.Funded).find(
                    (candidate) => candidate.field === field,
                ),
            ).input;
            const isOffered = ledgerOnlySnapshotRules().some(
                (rule) =>
                    rule.field === field &&
                    rule.requirement !== SnapshotFieldRequirement.Hidden,
            );
            const { caller, queries } = callerFor(
                SIGNED_IN,
                ledgerOnlyResponder(ledgerOnlyRow(), {
                    [TABLES.snapshot]: [snapshotRow()],
                }),
            );
            const creation = caller.snapshot.create({
                accountId: IDS.account,
                asOf: '2026-09-21',
                balanceCents: 15_100_000,
                source: SnapshotSource.Manual,
                ...(field !== SnapshotField.AsOf &&
                    field !== SnapshotField.Balance && {
                        [field]: snapshotFieldSample(input),
                    }),
            });
            if (isOffered) {
                await creation;
                expect(insertsInto(queries, TABLES.snapshot)).toHaveLength(1);
                return;
            }
            const error = await rejectionOf(creation);
            expect(errorShapeOf(error).data).toMatchObject({
                propRejection: mutationRejection(
                    PropMutationRejection.NotModeledForOperation,
                ),
            });
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it('rejects plan-bound snapshot fields on a ledger-only account with NotModeledForOperation', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        const error = await rejectionOf(
            caller.snapshot.create({
                accountId: IDS.account,
                asOf: '2026-09-21',
                balanceCents: 15_100_000,
                highestEodBalanceCents: 15_200_000,
                source: SnapshotSource.Manual,
                tradingDays: 4,
            }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.NotModeledForOperation,
            ),
        });
        expect(errorShapeOf(error).message).toContain(
            `takes only ${LEDGER_ONLY_SNAPSHOT_FIELD_LIST} in a snapshot`,
        );
        expect(propWrites(queries)).toHaveLength(0);
    });
});

describe('propAccounts.account.upgradeToModeled', () => {
    const target = planKeyFields(EVAL_ENTRY);

    const matchingStored = (overrides: FakeRow = {}) =>
        ledgerOnlyRow({
            account_size: target.accountSize,
            firm_id: target.firmId,
            stage: AccountStage.Eval,
            ...overrides,
        });

    it('refuses to change the stored size without an explicit confirmation and writes nothing', async () => {
        const { caller, queries } = upgradeCaller(
            matchingStored({ account_size: target.accountSize + 25_000 }),
        );
        const error = await rejectionOf(
            caller.account.upgradeToModeled({ ...target, id: IDS.account }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.UpgradeChangesAccount,
            ),
        });
        expect(errorShapeOf(error).message).toContain('size');
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('refuses to move the account to another listed firm without an explicit confirmation and writes nothing', async () => {
        const otherFirm =
            target.firmId === FirmId.Mffu ? FirmId.Apex : FirmId.Mffu;
        const { caller, queries } = upgradeCaller(
            matchingStored({ firm_id: otherFirm }),
        );
        const error = await rejectionOf(
            caller.account.upgradeToModeled({ ...target, id: IDS.account }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.UpgradeChangesAccount,
            ),
        });
        expect(errorShapeOf(error).message).toContain('firm');
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('names every change the shared upgrade rule finds, in the same words the detail page shows', async () => {
        const otherFirm =
            target.firmId === FirmId.Mffu ? FirmId.Apex : FirmId.Mffu;
        const storedSize = target.accountSize + 25_000;
        const { caller, queries } = upgradeCaller(
            matchingStored({ account_size: storedSize, firm_id: otherFirm }),
        );
        const error = await rejectionOf(
            caller.account.upgradeToModeled({ ...target, id: IDS.account }),
        );
        const changes = upgradeChanges(
            {
                accountSize: storedSize,
                externalFirmId: null,
                firmId: otherFirm,
            },
            target,
        );
        expect(changes).toHaveLength(2);
        for (const change of changes) {
            expect(errorShapeOf(error).message).toContain(
                upgradeChangeText(change, []),
            );
        }
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('refuses to upgrade while a stored snapshot row holding every plan field (a legacy or out-of-band row, not one snapshot.create stores on a ledger-only account) does not fit the plan, with ImplausibleSnapshot naming it, and writes nothing', async () => {
        const sizeCents = target.accountSize * 100;
        const { caller, queries } = upgradeCaller(matchingStored(), [
            snapshotRow({
                as_of: '2026-09-18',
                balance_cents: Math.round(sizeCents / 20),
                highest_eod_balance_cents: sizeCents,
                highest_intraday_balance_cents: sizeCents,
                trading_days: 3,
            }),
        ]);
        const error = await rejectionOf(
            caller.account.upgradeToModeled({ ...target, id: IDS.account }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.ImplausibleSnapshot,
            ),
        });
        expect(errorShapeOf(error).message).toContain('2026-09-18');
        expect(errorShapeOf(error).message).toContain(
            'remove that snapshot before upgrading',
        );
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('changes the size and firm once the change is confirmed', async () => {
        const { caller, queries } = upgradeCaller(
            matchingStored({
                account_size: target.accountSize + 25_000,
                firm_id:
                    target.firmId === FirmId.Mffu ? FirmId.Apex : FirmId.Mffu,
            }),
        );
        await caller.account.upgradeToModeled({
            ...target,
            confirmSizeOrFirmChange: true,
            id: IDS.account,
        });
        const [update] = updatesOf(queries, TABLES.account);
        expect(defined(update).params).toContain(target.accountSize);
        expect(defined(update).params).toContain(target.firmId);
    });

    it('refuses to move an account at one of your own firms to a listed firm without a confirmation, naming your firm read by user, and writes nothing', async () => {
        const { caller, queries } = upgradeCaller(
            matchingStored({
                external_firm_id: EXTERNAL_FIRM_ID,
                firm_id: null,
            }),
        );
        const error = await rejectionOf(
            caller.account.upgradeToModeled({ ...target, id: IDS.account }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.UpgradeChangesAccount,
            ),
        });
        const [change] = upgradeChanges(
            {
                accountSize: target.accountSize,
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: null,
            },
            target,
        );
        expect(errorShapeOf(error).message).toContain(
            upgradeChangeText(defined(change), [
                { id: EXTERNAL_FIRM_ID, name: 'Hola Prime' },
            ]),
        );
        expect(errorShapeOf(error).message).toContain('Hola Prime');
        const firmRead = defined(
            queries.find(
                (query) => readTable(query) === VIDEO_TABLES.externalFirm,
            ),
        );
        assertUserScopedWhere(firmRead, USER_ID);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('moves an account at one of your own firms to a listed firm of the same size once the move is confirmed', async () => {
        const { caller, queries } = upgradeCaller(
            matchingStored({
                external_firm_id: EXTERNAL_FIRM_ID,
                firm_id: null,
            }),
        );
        await caller.account.upgradeToModeled({
            ...target,
            confirmSizeOrFirmChange: true,
            id: IDS.account,
        });
        const [update] = updatesOf(queries, TABLES.account);
        expect(defined(update).params).toContain(target.firmId);
    });

    it('refuses to upgrade while a stored ledger-only snapshot does not hold what the plan requires, naming it, and writes nothing', async () => {
        const { caller, queries } = upgradeCaller(matchingStored(), [
            snapshotRow({
                as_of: '2026-09-18',
                balance_cents: target.accountSize * 100,
                highest_eod_balance_cents: null,
                highest_intraday_balance_cents: null,
                trading_days: null,
            }),
        ]);
        const error = await rejectionOf(
            caller.account.upgradeToModeled({ ...target, id: IDS.account }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.MissingSnapshotField,
            ),
        });
        expect(errorShapeOf(error).message).toContain('2026-09-18');
        expect(errorShapeOf(error).message).toContain(
            'remove that snapshot before upgrading',
        );
        const snapshotRead = defined(
            queries.find((query) => readTable(query) === TABLES.snapshot),
        );
        assertUserScopedWhere(snapshotRead, USER_ID);
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('resolves the plan, checks the stage, clears the plan label, sets tracking and logs one Edited event in one transaction', async () => {
        const stored = matchingStored();
        const upgraded = accountRow({ stage: AccountStage.Eval });
        const { caller, queries } = callerFor(SIGNED_IN, (query) => {
            if (isCount(query)) return [{ count: 0 }];
            return query.text.startsWith(`update "${TABLES.account}"`)
                ? [upgraded]
                : ledgerOnlyResponder(stored, { [TABLES.snapshot]: [] })(query);
        });
        const result = await caller.account.upgradeToModeled({
            ...target,
            id: IDS.account,
        });
        expect(result.tracking).toBe(AccountTracking.Modeled);
        const [update] = updatesOf(queries, TABLES.account);
        assertUserScopedWhere(defined(update), USER_ID);
        expect(defined(update).text).toMatch(/"plan_label" = \$\d+/);
        expect(defined(update).params).toContain(AccountTracking.Modeled);
        expect(defined(update).params).toContain(target.planSerial);
        const [edited] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(edited), 'kind')).toEqual([
            AccountEventKind.Edited,
        ]);
        const [storedDetail] = insertedColumnValues(defined(edited), 'detail');
        const detail = readAccountEventDetail(JSON.parse(String(storedDetail)));
        expect(detail.changes.map((change) => change.field)).toEqual(
            expect.arrayContaining(['tracking', 'planLabel', 'planSerial']),
        );
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('rejects a plan that does not offer the stored stage and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            ledgerOnlyResponder(ledgerOnlyRow({ stage: AccountStage.Eval })),
        );
        const error = await rejectionOf(
            caller.account.upgradeToModeled({
                ...planKeyFields(INSTANT_ENTRY),
                id: IDS.account,
            }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: {
                reason: PropMutationRejection.StageNotOfferedByPlan,
            },
        });
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('rejects an unknown plan before touching the database', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, ledgerOnlyResponder());
        await expect(
            caller.account.upgradeToModeled({
                ...target,
                id: IDS.account,
                planSerial: 'not-a-plan',
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('returns an account already modeled on the same plan unchanged, and refuses to re-plan one', async () => {
        const instantKey = planKeyFields(INSTANT_ENTRY);
        const same = callerFor(SIGNED_IN, tableResponder());
        await expect(
            same.caller.account.upgradeToModeled({
                ...target,
                id: IDS.account,
            }),
        ).resolves.toMatchObject({ tracking: AccountTracking.Modeled });
        expect(propWrites(same.queries)).toHaveLength(0);
        const other = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow({
                        account_size: instantKey.accountSize,
                        firm_id: instantKey.firmId,
                        opt_ins: NO_PLAN_OPT_INS,
                        plan_serial: instantKey.planSerial,
                        stage: AccountStage.Funded,
                    }),
                ],
            }),
        );
        const error = await rejectionOf(
            other.caller.account.upgradeToModeled({
                ...target,
                id: IDS.account,
            }),
        );
        expect(errorShapeOf(error).data).toMatchObject({
            propRejection: mutationRejection(
                PropMutationRejection.TrackingChange,
            ),
        });
        expect(propWrites(other.queries)).toHaveLength(0);
    });

    it('rejects a foreign account with NOT_FOUND and writes nothing', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, (query) =>
            isCount(query) ? [{ count: 0 }] : [],
        );
        await expect(
            caller.account.upgradeToModeled({ ...target, id: IDS.account }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
        expect(serializePlanId(EVAL_ENTRY.plan.id)).toBe(target.planSerial);
    });
});

describe('PropAccountRepo.isExternalFirmInUse with ledger-only accounts', () => {
    it('reports an external firm used only by a ledger-only account as in use, read by user', async () => {
        const { database, queries } = createFakeDatabase((query) =>
            readTable(query) === TABLES.account ? [{ id: IDS.account }] : [],
        );
        const repo = new PropAccountRepo(database, USER_ID);
        await expect(repo.isExternalFirmInUse(EXTERNAL_FIRM_ID)).resolves.toBe(
            true,
        );
        const accountRead = defined(
            queries.find((query) => readTable(query) === TABLES.account),
        );
        assertUserScopedWhere(accountRead, USER_ID);
        expect(accountRead.text).toContain('"external_firm_id" = $');
        expect(accountRead.params).toContain(EXTERNAL_FIRM_ID);
    });
});
