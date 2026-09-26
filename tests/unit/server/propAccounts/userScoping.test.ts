import { describe, expect, it, vi } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    compareText,
    FeeKind,
    PayoutStatus,
    SnapshotSource,
} from '~/lib/prop-accounts';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { propAccountsRouter } from '~/server/api/routers/propAccounts';

import {
    assertInsertedForUser,
    assertUserScopedWhere,
    type IssuedQuery,
    readTable,
    writeTable,
} from '../fakeDatabase';
import {
    accountCreateInput,
    accountUpdateInput,
    ANONYMOUS,
    callerFor,
    IDS,
    propWrites,
    SIGNED_IN,
    tableResponder,
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

type Procedure = (input: unknown) => Promise<unknown>;

const JOURNAL_TABLE = 'sadranl_trade_assessment';

const VALID_INPUTS: Readonly<Record<string, unknown>> = {
    'account.archive': { id: IDS.account },
    'account.create': accountCreateInput(),
    'account.get': { id: IDS.account },
    'account.importMany': [accountCreateInput({ label: 'Imported' })],
    'account.list': {},
    'account.remove': { id: IDS.account },
    'account.unarchive': { id: IDS.account },
    'account.update': accountUpdateInput({ label: 'Renamed' }),
    'copyGroup.assign': {
        accountId: IDS.account,
        copyGroupId: IDS.copyGroup,
    },
    'copyGroup.create': { name: 'Group two' },
    'copyGroup.list': undefined,
    'copyGroup.remove': { id: IDS.copyGroup },
    'copyGroup.update': { id: IDS.copyGroup, name: 'Renamed', notes: null },
    'decision.create': {
        acceptedRiskCents: 40_000,
        acceptedRungsCents: [40_000],
        accountId: IDS.account,
        decidedOn: '2026-09-21',
        headlineRiskCents: 40_000,
        snapshotId: IDS.snapshot,
        source: 'documented',
        stage: AccountStage.Eval,
    },
    'decision.listForAccount': { id: IDS.account },
    'decision.recordActual': { actualRiskCents: 30_000, id: IDS.decision },
    'edge.summary': {},
    'event.list': { from: '2026-01-01', to: '2026-09-30' },
    'event.listForAccount': { id: IDS.account },
    'event.record': {
        accountId: IDS.account,
        kind: AccountEventKind.Busted,
        occurredOn: '2026-09-21',
    },
    'fee.create': {
        accountId: IDS.account,
        amountCents: 16_500,
        kind: FeeKind.EvalPurchase,
        paidOn: '2026-09-01',
    },
    'fee.list': {},
    'fee.remove': { id: IDS.fee },
    'fee.update': {
        amountCents: 17_000,
        id: IDS.fee,
        kind: FeeKind.Refund,
        note: null,
        paidOn: '2026-09-02',
    },
    'payout.create': {
        accountId: IDS.account,
        grossCents: 50_000,
        requestedOn: '2026-09-08',
        status: PayoutStatus.Requested,
    },
    'payout.list': {},
    'payout.remove': { id: IDS.payout },
    'payout.update': {
        grossCents: 50_000,
        id: IDS.payout,
        netCents: 45_000,
        note: null,
        paidOn: '2026-09-10',
        requestedOn: '2026-09-08',
        status: PayoutStatus.Paid,
    },
    'rulebook.get': undefined,
    'rulebook.reset': undefined,
    'rulebook.upsert': DEFAULT_RULEBOOK,
    'scenario.importMany': [{ name: 'Imported', query: 'firm=apex' }],
    'scenario.list': undefined,
    'scenario.remove': { id: IDS.scenario },
    'scenario.removeAll': undefined,
    'scenario.save': { name: 'Scenario two', query: 'firm=topstep' },
    'snapshot.bulkCreate': [
        {
            accountId: IDS.account,
            asOf: '2026-09-21',
            balanceCents: 5_050_000,
            dashboardFloorCents: 4_900_000,
            highestEodBalanceCents: 5_100_000,
            source: SnapshotSource.WeeklyReview,
            tradingDays: 4,
        },
    ],
    'snapshot.create': {
        accountId: IDS.account,
        asOf: '2026-09-21',
        balanceCents: 5_050_000,
        dashboardFloorCents: 4_900_000,
        highestEodBalanceCents: 5_100_000,
        source: SnapshotSource.Manual,
        tradingDays: 4,
    },
    'snapshot.latestForAll': undefined,
    'snapshot.listForAccount': { id: IDS.account },
    'snapshot.remove': { id: IDS.snapshot },
};

const MUTATIONS_BY_ID = [
    'account.archive',
    'account.remove',
    'account.unarchive',
    'account.update',
    'copyGroup.assign',
    'copyGroup.remove',
    'copyGroup.update',
    'decision.create',
    'decision.recordActual',
    'event.record',
    'fee.create',
    'fee.remove',
    'fee.update',
    'payout.create',
    'payout.remove',
    'payout.update',
    'scenario.remove',
    'snapshot.bulkCreate',
    'snapshot.create',
    'snapshot.remove',
];

const PROCEDURE_PATHS = Object.keys(
    propAccountsRouter._def.procedures,
).toSorted(compareText);

function assertScoped(queries: readonly IssuedQuery[]): void {
    const propQueries = queries.filter((query) =>
        isUserOwnedTable(readTable(query) ?? writeTable(query) ?? ''),
    );
    expect(propQueries.length).toBeGreaterThan(0);
    for (const query of propQueries) {
        if (query.text.startsWith('insert into')) {
            assertInsertedForUser(query, USER_ID);
            if (/\son conflict\s.*\sdo update\s/is.test(query.text)) {
                assertUserScopedWhere(query, USER_ID);
            }
        } else {
            assertUserScopedWhere(query, USER_ID);
        }
    }
}

function isUserOwnedTable(table: string): boolean {
    return table.startsWith('sadranl_prop_') || table === JOURNAL_TABLE;
}

function procedureAt(caller: unknown, path: string): Procedure {
    const [router = '', name = ''] = path.split('.', 2);
    const routers = caller as Record<string, Record<string, Procedure>>;
    const procedure = routers[router]?.[name];
    if (procedure === undefined) throw new Error(`no procedure ${path}`);
    return procedure;
}

describe('propAccounts user scoping', () => {
    it('covers every procedure of the router with a valid input', () => {
        expect(Object.keys(VALID_INPUTS).toSorted(compareText)).toEqual(
            PROCEDURE_PATHS,
        );
    });

    it.each(PROCEDURE_PATHS)(
        '%s rejects an anonymous caller with UNAUTHORIZED',
        async (path) => {
            const { caller, queries } = callerFor(ANONYMOUS, tableResponder());
            await expect(
                procedureAt(caller, path)(VALID_INPUTS[path]),
            ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
            expect(queries).toHaveLength(0);
        },
    );

    it.each(PROCEDURE_PATHS)(
        '%s scopes every prop select, update and delete by the session user',
        async (path) => {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            await procedureAt(caller, path)(VALID_INPUTS[path]);
            assertScoped(queries);
        },
    );

    it('edge.summary reads the journal and scopes that read by the session user', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.edge.summary({ from: '2026-09-01', to: '2026-09-30' });
        const journalReads = queries.filter(
            (query) => readTable(query) === JOURNAL_TABLE,
        );
        expect(journalReads).toHaveLength(1);
        assertScoped(queries);
    });

    it('scopes event.list by the session user with and without an account id', async () => {
        for (const input of [
            { from: '2026-01-01', to: '2026-09-30' },
            { accountId: IDS.account, from: '2026-01-01', to: '2026-09-30' },
            {},
        ]) {
            const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
            await caller.event.list(input);
            assertScoped(queries);
        }
    });

    it.each(MUTATIONS_BY_ID)(
        '%s throws NOT_FOUND for a foreign id and writes nothing',
        async (path) => {
            const { caller, queries } = callerFor(SIGNED_IN, (query) =>
                /^select count\(\*\)/i.test(query.text) ? [{ count: 0 }] : [],
            );
            await expect(
                procedureAt(caller, path)(VALID_INPUTS[path]),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(propWrites(queries)).toHaveLength(0);
        },
    );

    it.each([
        ['copyGroupId', IDS.copyGroup],
        ['replacesAccountId', IDS.otherAccount],
    ])(
        'account.create with a foreign %s throws NOT_FOUND and writes nothing',
        async (field, id) => {
            const { caller, queries } = callerFor(SIGNED_IN, (query) =>
                /^select count\(\*\)/i.test(query.text) ? [{ count: 0 }] : [],
            );
            await expect(
                caller.account.create(accountCreateInput({ [field]: id })),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(
                caller.account.importMany([
                    accountCreateInput({ [field]: id }),
                ]),
            ).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(propWrites(queries)).toHaveLength(0);
        },
    );
});
