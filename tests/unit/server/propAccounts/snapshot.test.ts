import { describe, expect, it, vi } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    readAccountEventDetail,
    SnapshotSource,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    DrawdownKind,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';

import {
    assertUserScopedWhere,
    type FakeRow,
    insertedColumnValues,
    readTable,
    TransactionStep,
    transactionSteps,
} from '../fakeDatabase';
import {
    accountRow,
    callerFor,
    defined,
    errorShapeOf,
    eventRow,
    IDS,
    insertsInto,
    isCount,
    planKeyFields,
    propWrites,
    type RegistryEntry,
    rejectionOf,
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

type Caller = ReturnType<typeof callerFor>['caller'];

const ORDER_NEWEST_FIRST =
    /order by (?:"\w+"\.)?"as_of" desc, (?:"\w+"\.)?"created_at" desc, (?:"\w+"\.)?"id" desc/;

async function bulkCreateRejection(
    caller: Caller,
    batch: Parameters<Caller['snapshot']['bulkCreate']>[0],
) {
    return errorShapeOf(await rejectionOf(caller.snapshot.bulkCreate(batch)));
}

function entryWithEvalDrawdown(kind: DrawdownKind): RegistryEntry {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(
            (candidate: Plan) =>
                !candidate.isInstantFunded &&
                candidate.drawdownFor(TradingPhase.Eval).kind === kind,
        );
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error(`no eval plan with a ${kind} drawdown`);
}

function planAccountRow(entry: RegistryEntry, overrides: FakeRow = {}) {
    const key = planKeyFields(entry);
    return accountRow({
        account_size: key.accountSize,
        firm_id: key.firmId,
        plan_serial: key.planSerial,
        ...overrides,
    });
}

function snapshotInput(
    accountId: string,
    asOf: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountId,
        asOf,
        balanceCents: 5_050_000,
        dashboardFloorCents: 4_800_000,
        highestEodBalanceCents: 5_100_000,
        source: SnapshotSource.WeeklyReview,
        tradingDays: 4,
        ...overrides,
    };
}

const EOD_ENTRY = entryWithEvalDrawdown(DrawdownKind.EodTrailing);
const INTRADAY_ENTRY = entryWithEvalDrawdown(DrawdownKind.IntradayTrailing);

describe('propAccounts.snapshot', () => {
    it('create checks the account belongs to the user before inserting', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.snapshot.create(snapshotInput(IDS.account, '2026-09-21'));
        const load = queries.find(
            (query) => readTable(query) === TABLES.account && !isCount(query),
        );
        expect(load).toBeDefined();
        assertUserScopedWhere(defined(load), USER_ID);
        const [insert] = insertsInto(queries, TABLES.snapshot);
        expect(insertedColumnValues(defined(insert), 'user_id')).toEqual([
            USER_ID,
        ]);
    });

    it('bulkCreate checks ownership of every account id and inserts nothing when one is foreign', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [accountRow()] }),
        );
        await expect(
            caller.snapshot.bulkCreate([
                snapshotInput(IDS.account, '2026-09-21'),
                snapshotInput(IDS.otherAccount, '2026-09-21'),
            ]),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(propWrites(queries)).toHaveLength(0);
        const load = queries.find(
            (query) => readTable(query) === TABLES.account && !isCount(query),
        );
        expect(load?.params).toEqual(
            expect.arrayContaining([IDS.account, IDS.otherAccount, USER_ID]),
        );
    });

    it('bulkCreate inserts every snapshot in one statement for the session user', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow(),
                    accountRow({ id: IDS.otherAccount, label: 'Two' }),
                ],
            }),
        );
        await caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-21'),
            snapshotInput(IDS.otherAccount, '2026-09-21'),
        ]);
        const inserts = insertsInto(queries, TABLES.snapshot);
        expect(inserts).toHaveLength(1);
        expect(insertedColumnValues(defined(inserts[0]), 'user_id')).toEqual([
            USER_ID,
            USER_ID,
        ]);
        expect(insertedColumnValues(defined(inserts[0]), 'account_id')).toEqual(
            [IDS.account, IDS.otherAccount],
        );
    });

    it('listForAccount and latestForAll order newest first by as_of, created_at, then id', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.snapshot.listForAccount({ id: IDS.account });
        await caller.snapshot.latestForAll();
        const [list, latest] = queries;
        expect(list?.text).toMatch(ORDER_NEWEST_FIRST);
        expect(list?.text).not.toMatch(/nulls/i);
        expect(latest?.text).toMatch(
            /^select distinct on \((?:"\w+"\.)?"account_id"\)/,
        );
        expect(latest?.text).toMatch(
            /order by (?:"\w+"\.)?"account_id", (?:"\w+"\.)?"as_of" desc, (?:"\w+"\.)?"created_at" desc, (?:"\w+"\.)?"id" desc/,
        );
    });

    it('remove clears decision links, deletes the snapshot and logs an Edited event in one transaction', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.snapshot.remove({ id: IDS.snapshot });
        const writes = propWrites(queries).map((query) => query.text);
        expect(writes[0]).toMatch(
            /^update "sadranl_prop_sizing_decision" set "snapshot_id" = \$1/,
        );
        expect(writes[1]).toMatch(
            /^delete from "sadranl_prop_account_snapshot"/,
        );
        expect(writes[2]).toMatch(/^insert into "sadranl_prop_account_event"/);
        const [event] = insertsInto(queries, TABLES.event);
        expect(insertedColumnValues(defined(event), 'kind')).toEqual([
            AccountEventKind.Edited,
        ]);
        const [raw] = insertedColumnValues(defined(event), 'detail');
        const detail = readAccountEventDetail(
            typeof raw === 'string' ? JSON.parse(raw) : raw,
        );
        expect(detail.changes).toEqual(
            expect.arrayContaining([
                { field: 'snapshot.asOf', from: '2026-09-20', to: null },
                { field: 'snapshot.balanceCents', from: 5_100_000, to: null },
            ]),
        );
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Commit,
        ]);
    });

    it('bulkCreate rejects a snapshot missing a field its plan and stage require, naming the account, date and field', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [planAccountRow(EOD_ENTRY)] }),
        );
        const error = await rejectionOf(
            caller.snapshot.bulkCreate([
                snapshotInput(IDS.account, '2026-09-21', {
                    highestEodBalanceCents: null,
                    tradingDays: null,
                }),
            ]),
        );
        const shape = errorShapeOf(error);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('"Eval one"');
        expect(shape.message).toContain('2026-09-21');
        expect(shape.message).toContain('Trading days');
        expect(shape.message).toContain('Highest end-of-day balance');
        expect(shape.message).not.toContain(String.fromCodePoint(0x20_14));
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('bulkCreate needs the payouts taken of a funded account but not of an eval account', async () => {
        const funded = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    planAccountRow(EOD_ENTRY, {
                        funded_on: '2026-09-10',
                        stage: AccountStage.Funded,
                    }),
                ],
            }),
        );
        const shape = await bulkCreateRejection(funded.caller, [
            snapshotInput(IDS.account, '2026-09-21'),
        ]);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('Payouts taken');
        expect(propWrites(funded.queries)).toHaveLength(0);

        const evaluation = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [planAccountRow(EOD_ENTRY)] }),
        );
        await evaluation.caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-21'),
        ]);
        expect(insertsInto(evaluation.queries, TABLES.snapshot)).toHaveLength(
            1,
        );
    });

    it('bulkCreate checks a row dated before the funded date of a funded account against the eval rules', async () => {
        const responder = tableResponder({
            [TABLES.account]: [
                planAccountRow(EOD_ENTRY, {
                    funded_on: '2026-09-10',
                    stage: AccountStage.Funded,
                }),
            ],
        });
        const backfill = callerFor(SIGNED_IN, responder);
        await backfill.caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-05'),
        ]);
        expect(insertsInto(backfill.queries, TABLES.snapshot)).toHaveLength(1);

        const fundedDay = callerFor(SIGNED_IN, responder);
        const shape = await bulkCreateRejection(fundedDay.caller, [
            snapshotInput(IDS.account, '2026-09-10'),
        ]);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('Payouts taken');
        expect(propWrites(fundedDay.queries)).toHaveLength(0);
    });

    it('bulkCreate dates the eval stage by the recorded pass when the funded date is unknown, reading the events for the session user only', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    planAccountRow(EOD_ENTRY, { stage: AccountStage.Funded }),
                ],
                [TABLES.event]: [
                    eventRow(),
                    eventRow({
                        id: IDS.decision,
                        kind: AccountEventKind.EvalPassed,
                        occurred_on: '2026-09-10',
                    }),
                ],
            }),
        );
        await caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-05'),
        ]);
        expect(insertsInto(queries, TABLES.snapshot)).toHaveLength(1);
        const lookup = defined(
            queries.find(
                (query) => readTable(query) === TABLES.event && !isCount(query),
            ),
        );
        assertUserScopedWhere(lookup, USER_ID);
        expect(lookup.params).toEqual(
            expect.arrayContaining([
                IDS.account,
                AccountEventKind.EvalPassed,
                AccountEventKind.MovedLive,
            ]),
        );
    });

    it('bulkCreate keeps the current stage rules when the start of that stage is unknown', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    planAccountRow(EOD_ENTRY, { stage: AccountStage.Funded }),
                ],
            }),
        );
        const shape = await bulkCreateRejection(caller, [
            snapshotInput(IDS.account, '2026-09-05'),
        ]);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('Payouts taken');
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('bulkCreate checks a live account row dated before its move live against the funded rules', async () => {
        const responder = tableResponder({
            [TABLES.account]: [
                planAccountRow(EOD_ENTRY, {
                    funded_on: '2026-09-10',
                    stage: AccountStage.Live,
                }),
            ],
            [TABLES.event]: [
                eventRow({
                    kind: AccountEventKind.MovedLive,
                    occurred_on: '2026-09-15',
                }),
            ],
        });
        const withoutPeak = { highestEodBalanceCents: null, payoutsTaken: 0 };
        const fundedEra = callerFor(SIGNED_IN, responder);
        const shape = await bulkCreateRejection(fundedEra.caller, [
            snapshotInput(IDS.account, '2026-09-12', withoutPeak),
        ]);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('Highest end-of-day balance');
        expect(propWrites(fundedEra.queries)).toHaveLength(0);

        const liveEra = callerFor(SIGNED_IN, responder);
        await liveEra.caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-15', withoutPeak),
        ]);
        expect(insertsInto(liveEra.queries, TABLES.snapshot)).toHaveLength(1);
    });

    it('bulkCreate dates the eval-leaving day by a recorded pass before the funded date, as the ledger does', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    planAccountRow(EOD_ENTRY, {
                        funded_on: '2026-09-10',
                        stage: AccountStage.Funded,
                    }),
                ],
                [TABLES.event]: [
                    eventRow({
                        kind: AccountEventKind.EvalPassed,
                        occurred_on: '2026-09-08',
                    }),
                ],
            }),
        );
        const shape = await bulkCreateRejection(caller, [
            snapshotInput(IDS.account, '2026-09-09'),
        ]);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('funded stage');
        expect(shape.message).toContain('Payouts taken');
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('bulkCreate checks a live account with no recorded move live against the eval rules before it left the evaluation and the live rules after', async () => {
        const responder = tableResponder({
            [TABLES.account]: [
                planAccountRow(EOD_ENTRY, {
                    funded_on: '2026-09-10',
                    stage: AccountStage.Live,
                }),
            ],
            [TABLES.event]: [eventRow()],
        });
        const evalEra = callerFor(SIGNED_IN, responder);
        await evalEra.caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-05'),
        ]);
        expect(insertsInto(evalEra.queries, TABLES.snapshot)).toHaveLength(1);

        const liveEra = callerFor(SIGNED_IN, responder);
        await liveEra.caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-12', {
                highestEodBalanceCents: null,
                payoutsTaken: 0,
            }),
        ]);
        expect(insertsInto(liveEra.queries, TABLES.snapshot)).toHaveLength(1);

        const liveMissing = callerFor(SIGNED_IN, responder);
        const shape = await bulkCreateRejection(liveMissing.caller, [
            snapshotInput(IDS.account, '2026-09-12'),
        ]);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('live stage');
        expect(shape.message).toContain('Payouts taken');
        expect(propWrites(liveMissing.queries)).toHaveLength(0);
    });

    it('bulkCreate on an intraday trailing plan needs the dashboard floor or the highest intraday balance', async () => {
        const responder = tableResponder({
            [TABLES.account]: [planAccountRow(INTRADAY_ENTRY)],
        });
        const missing = callerFor(SIGNED_IN, responder);
        const shape = await bulkCreateRejection(missing.caller, [
            snapshotInput(IDS.account, '2026-09-21', {
                dashboardFloorCents: null,
            }),
        ]);
        expect(shape.data.code).toBe('BAD_REQUEST');
        expect(shape.message).toContain('Highest intraday balance');
        expect(shape.message).toContain('Drawdown floor on the dashboard');
        expect(propWrites(missing.queries)).toHaveLength(0);

        for (const alternative of [
            { dashboardFloorCents: 4_800_000 },
            {
                dashboardFloorCents: null,
                highestIntradayBalanceCents: 5_150_000,
            },
        ]) {
            const present = callerFor(SIGNED_IN, responder);
            await present.caller.snapshot.bulkCreate([
                snapshotInput(IDS.account, '2026-09-21', alternative),
            ]);
            expect(insertsInto(present.queries, TABLES.snapshot)).toHaveLength(
                1,
            );
        }
    });

    it('bulkCreate reports a foreign account before any field rule', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [planAccountRow(EOD_ENTRY)] }),
        );
        const shape = await bulkCreateRejection(caller, [
            snapshotInput(IDS.account, '2026-09-21', {
                tradingDays: null,
            }),
            snapshotInput(IDS.otherAccount, '2026-09-21', {
                tradingDays: null,
            }),
        ]);
        expect(shape.data.code).toBe('NOT_FOUND');
        expect(propWrites(queries)).toHaveLength(0);
    });

    it('bulkCreate rejects a snapshot whose account and date are already stored and writes nothing', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    planAccountRow(EOD_ENTRY),
                    planAccountRow(EOD_ENTRY, {
                        id: IDS.otherAccount,
                        label: 'Two',
                    }),
                ],
                [TABLES.snapshot]: [snapshotRow({ as_of: '2026-09-21' })],
            }),
        );
        const shape = await bulkCreateRejection(caller, [
            snapshotInput(IDS.otherAccount, '2026-09-21'),
            snapshotInput(IDS.account, '2026-09-21'),
        ]);
        expect(shape.data.code).toBe('CONFLICT');
        expect(shape.message).toContain('"Eval one"');
        expect(shape.message).toContain('2026-09-21');
        expect(shape.message).toContain('already stored');
        expect(shape.message).not.toContain('"Two"');
        expect(propWrites(queries)).toHaveLength(0);
        const lookup = defined(
            queries.find(
                (query) =>
                    readTable(query) === TABLES.snapshot && !isCount(query),
            ),
        );
        assertUserScopedWhere(lookup, USER_ID);
        expect(lookup.params).toEqual(
            expect.arrayContaining([IDS.account, IDS.otherAccount]),
        );
    });

    it('bulkCreate accepts a date already stored for a different account', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [planAccountRow(EOD_ENTRY)],
                [TABLES.snapshot]: [
                    snapshotRow({ as_of: '2026-09-20' }),
                    snapshotRow({
                        account_id: IDS.otherAccount,
                        as_of: '2026-09-21',
                    }),
                ],
            }),
        );
        await caller.snapshot.bulkCreate([
            snapshotInput(IDS.account, '2026-09-21'),
        ]);
        expect(insertsInto(queries, TABLES.snapshot)).toHaveLength(1);
    });

    it('create keeps allowing a same-day manual snapshot next to a stored one', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.snapshot]: [snapshotRow({ as_of: '2026-09-21' })],
            }),
        );
        await caller.snapshot.create({
            ...snapshotInput(IDS.account, '2026-09-21'),
            source: SnapshotSource.Manual,
        });
        expect(insertsInto(queries, TABLES.snapshot)).toHaveLength(1);
    });
});
