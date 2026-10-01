import { describe, expect, it, vi } from 'vitest';

import {
    PROP_QUOTA_LIMITS,
    PropAccountRepo,
    PropListTooLargeError,
    PropRecordNotFoundError,
} from '~/lib/prop-accounts/server';
import { PropQuota, PropRecord } from '~/lib/schemas/propAccountOutputs';

import {
    assertUserScopedWhere,
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    readTable,
    TransactionStep,
} from '../fakeDatabase';
import { accountRow, TABLES, USER_ID } from './propRouterHarness';
import {
    bankrollTransferRow,
    externalFirmRow,
    firmEngagementRow,
    firmStatementRow,
    roundRow,
    VIDEO_IDS,
    VIDEO_TABLES,
    violationRow,
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

interface ListCase {
    readonly call: RepoCall;
    readonly name: string;
    readonly quota: PropQuota;
    readonly record: PropRecord;
    readonly row: () => FakeRow;
    readonly table: string;
}

interface LoadCase {
    readonly call: RepoCall;
    readonly id: string;
    readonly name: string;
    readonly record: PropRecord;
    readonly row: () => FakeRow;
    readonly table: string;
}

type RepoCall = (repo: PropAccountRepo) => Promise<unknown>;

type Responder = (query: IssuedQuery) => FakeRow[];

const TRANSACTION_TEXT = new Set<string>(Object.values(TransactionStep));

const LIST_CASES: readonly ListCase[] = [
    {
        call: (repo) => repo.listBankrollTransfers(),
        name: 'listBankrollTransfers',
        quota: PropQuota.BankrollTransfers,
        record: PropRecord.BankrollTransfer,
        row: bankrollTransferRow,
        table: VIDEO_TABLES.bankrollTransfer,
    },
    {
        call: (repo) => repo.listExternalFirms(),
        name: 'listExternalFirms',
        quota: PropQuota.ExternalFirms,
        record: PropRecord.ExternalFirm,
        row: externalFirmRow,
        table: VIDEO_TABLES.externalFirm,
    },
    {
        call: (repo) => repo.listRounds(),
        name: 'listRounds',
        quota: PropQuota.Rounds,
        record: PropRecord.Round,
        row: roundRow,
        table: VIDEO_TABLES.round,
    },
    {
        call: (repo) => repo.listFirmEngagements(),
        name: 'listFirmEngagements',
        quota: PropQuota.FirmEngagements,
        record: PropRecord.FirmEngagement,
        row: firmEngagementRow,
        table: VIDEO_TABLES.firmEngagement,
    },
    {
        call: (repo) => repo.listFirmStatements(),
        name: 'listFirmStatements',
        quota: PropQuota.FirmStatements,
        record: PropRecord.FirmStatement,
        row: firmStatementRow,
        table: VIDEO_TABLES.firmStatement,
    },
    {
        call: (repo) => repo.listViolations(),
        name: 'listViolations',
        quota: PropQuota.Violations,
        record: PropRecord.Violation,
        row: violationRow,
        table: VIDEO_TABLES.violation,
    },
    {
        call: (repo) => repo.listViolations(VIDEO_IDS.account),
        name: 'listViolations for one account',
        quota: PropQuota.Violations,
        record: PropRecord.Violation,
        row: violationRow,
        table: VIDEO_TABLES.violation,
    },
    {
        call: (repo) => repo.listAccountRefsInRound(VIDEO_IDS.round),
        name: 'listAccountRefsInRound',
        quota: PropQuota.Accounts,
        record: PropRecord.Account,
        row: () => accountRow({ round_id: VIDEO_IDS.round }),
        table: TABLES.account,
    },
];

const LOAD_CASES: readonly LoadCase[] = [
    {
        call: (repo) =>
            repo.loadOwnedBankrollTransferOrThrow(VIDEO_IDS.bankrollTransfer),
        id: VIDEO_IDS.bankrollTransfer,
        name: 'loadOwnedBankrollTransferOrThrow',
        record: PropRecord.BankrollTransfer,
        row: bankrollTransferRow,
        table: VIDEO_TABLES.bankrollTransfer,
    },
    {
        call: (repo) =>
            repo.loadOwnedExternalFirmOrThrow(VIDEO_IDS.externalFirm),
        id: VIDEO_IDS.externalFirm,
        name: 'loadOwnedExternalFirmOrThrow',
        record: PropRecord.ExternalFirm,
        row: externalFirmRow,
        table: VIDEO_TABLES.externalFirm,
    },
    {
        call: (repo) => repo.loadOwnedRoundOrThrow(VIDEO_IDS.round),
        id: VIDEO_IDS.round,
        name: 'loadOwnedRoundOrThrow',
        record: PropRecord.Round,
        row: roundRow,
        table: VIDEO_TABLES.round,
    },
    {
        call: (repo) =>
            repo.loadOwnedFirmEngagementOrThrow(VIDEO_IDS.firmEngagement),
        id: VIDEO_IDS.firmEngagement,
        name: 'loadOwnedFirmEngagementOrThrow',
        record: PropRecord.FirmEngagement,
        row: firmEngagementRow,
        table: VIDEO_TABLES.firmEngagement,
    },
    {
        call: (repo) =>
            repo.loadOwnedFirmStatementOrThrow(VIDEO_IDS.firmStatement),
        id: VIDEO_IDS.firmStatement,
        name: 'loadOwnedFirmStatementOrThrow',
        record: PropRecord.FirmStatement,
        row: firmStatementRow,
        table: VIDEO_TABLES.firmStatement,
    },
    {
        call: (repo) => repo.loadOwnedViolationOrThrow(VIDEO_IDS.violation),
        id: VIDEO_IDS.violation,
        name: 'loadOwnedViolationOrThrow',
        record: PropRecord.Violation,
        row: violationRow,
        table: VIDEO_TABLES.violation,
    },
];

function limitParameter(query: IssuedQuery | undefined): unknown {
    const match = / limit \$(\d+)(?: for update)?$/.exec(query?.text ?? '');
    return match?.[1] ? query?.params[Number(match[1]) - 1] : undefined;
}

function rowsFor(tables: Readonly<Record<string, FakeRow[]>>): Responder {
    return (query) => tables[readTable(query) ?? ''] ?? [];
}

async function runScoped(
    call: RepoCall,
    responder: Responder,
): Promise<{ plain: unknown; statements: IssuedQuery[] }> {
    const direct = createFakeDatabase(responder);
    const plain = await call(new PropAccountRepo(direct.database, USER_ID));
    const inTransaction = createFakeDatabase(responder);
    const transactional = await inTransaction.database.transaction((tx) =>
        call(new PropAccountRepo(tx, USER_ID)),
    );
    expect(transactional).toEqual(plain);
    const statements = [
        ...statementsOf(direct.queries),
        ...statementsOf(inTransaction.queries),
    ];
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
        assertUserScopedWhere(statement, USER_ID);
    }
    return { plain, statements };
}

function statementsOf(queries: readonly IssuedQuery[]): IssuedQuery[] {
    return queries.filter(
        (query) => !TRANSACTION_TEXT.has(query.text.trim().toLowerCase()),
    );
}

describe('PropAccountRepo video record reads', () => {
    it.each(LIST_CASES)(
        '$name reads only the caller rows of its table, in and out of a transaction',
        async ({ call, row, table }) => {
            const { plain, statements } = await runScoped(
                call,
                rowsFor({ [table]: [row()] }),
            );
            expect(plain).toHaveLength(1);
            for (const statement of statements) {
                expect(readTable(statement)).toBe(table);
            }
        },
    );

    it.each(LIST_CASES)(
        '$name fails loud past its cap instead of dropping rows',
        async ({ call, quota, record, row, table }) => {
            const limit = PROP_QUOTA_LIMITS[quota];
            const { database, queries } = createFakeDatabase(
                rowsFor({
                    [table]: Array.from({ length: limit + 1 }, row),
                }),
            );
            await expect(
                call(new PropAccountRepo(database, USER_ID)),
            ).rejects.toThrow(new PropListTooLargeError(record, limit));
            expect(limitParameter(queries[0])).toBe(limit + 1);
        },
    );

    it('filters violations and round members by the given parent id', async () => {
        const violations = await runScoped(
            (repo) => repo.listViolations(VIDEO_IDS.account),
            rowsFor({ [VIDEO_TABLES.violation]: [violationRow()] }),
        );
        const members = await runScoped(
            (repo) => repo.listAccountRefsInRound(VIDEO_IDS.round),
            rowsFor({ [TABLES.account]: [accountRow()] }),
        );
        for (const statement of violations.statements) {
            expect(statement.text).toContain('"account_id" = $');
            expect(statement.params).toContain(VIDEO_IDS.account);
        }
        for (const statement of members.statements) {
            expect(statement.text).toContain('"round_id" = $');
            expect(statement.params).toContain(VIDEO_IDS.round);
        }
    });

    it.each(LOAD_CASES)(
        '$name loads one caller row by id, in and out of a transaction',
        async ({ call, id, row, table }) => {
            const { plain, statements } = await runScoped(
                call,
                rowsFor({ [table]: [row()] }),
            );
            expect(plain).toMatchObject({ id });
            for (const statement of statements) {
                expect(readTable(statement)).toBe(table);
                expect(statement.params).toContain(id);
                expect(limitParameter(statement)).toBe(1);
            }
        },
    );

    it.each(LOAD_CASES)(
        '$name says the record is not found when the caller does not own it',
        async ({ call, record }) => {
            const { database } = createFakeDatabase(() => []);
            await expect(
                call(new PropAccountRepo(database, USER_ID)),
            ).rejects.toThrow(new PropRecordNotFoundError(record));
        },
    );

    it('locks the round row only when asked', async () => {
        const responder = rowsFor({ [VIDEO_TABLES.round]: [roundRow()] });
        const locked = await runScoped(
            (repo) => repo.loadOwnedRoundOrThrow(VIDEO_IDS.round, true),
            responder,
        );
        const unlocked = await runScoped(
            (repo) => repo.loadOwnedRoundOrThrow(VIDEO_IDS.round),
            responder,
        );
        for (const statement of locked.statements) {
            expect(statement.text).toMatch(/ for update$/);
        }
        for (const statement of unlocked.statements) {
            expect(statement.text).not.toMatch(/ for update$/);
        }
    });
});

describe('PropAccountRepo batched external firm ownership', () => {
    const SECOND_EXTERNAL_FIRM_ID = 'b2222222-2222-4222-8222-222222222223';

    it('loadOwnedExternalFirmsOrThrow reads every owned firm keyed by id in one query naming exactly those ids and the user id', async () => {
        const ids = [VIDEO_IDS.externalFirm, SECOND_EXTERNAL_FIRM_ID];
        const { plain, statements } = await runScoped(
            (repo) => repo.loadOwnedExternalFirmsOrThrow(ids),
            rowsFor({
                [VIDEO_TABLES.externalFirm]: ids.map((id) =>
                    externalFirmRow({ id }),
                ),
            }),
        );
        const owned = plain as ReadonlyMap<string, FakeRow>;
        expect(owned.keys().toArray()).toEqual(ids);
        expect(statements).toHaveLength(2);
        for (const statement of statements) {
            expect(readTable(statement)).toBe(VIDEO_TABLES.externalFirm);
            expect(statement.text).toContain(' in (');
            expect(statement.params).toEqual(
                expect.arrayContaining([...ids, USER_ID]),
            );
        }
    });

    it('loadOwnedExternalFirmsOrThrow throws when any requested id is not owned', async () => {
        const ids = [VIDEO_IDS.externalFirm, SECOND_EXTERNAL_FIRM_ID];
        const { database } = createFakeDatabase(
            rowsFor({
                [VIDEO_TABLES.externalFirm]: [
                    externalFirmRow({ id: VIDEO_IDS.externalFirm }),
                ],
            }),
        );
        await expect(
            new PropAccountRepo(
                database,
                USER_ID,
            ).loadOwnedExternalFirmsOrThrow(ids),
        ).rejects.toThrow(new PropRecordNotFoundError(PropRecord.ExternalFirm));
    });

    it('loadOwnedExternalFirmsOrThrow reads nothing for an empty id list', async () => {
        const { database, queries } = createFakeDatabase(() => []);
        const owned = await new PropAccountRepo(
            database,
            USER_ID,
        ).loadOwnedExternalFirmsOrThrow([]);
        expect(owned.size).toBe(0);
        expect(queries).toHaveLength(0);
    });
});

describe('PropAccountRepo earliest violation', () => {
    it('earliestViolationOn reads the earliest occurredOn with one bounded, ascending, user-scoped query', async () => {
        const violations = [
            violationRow({ occurred_on: '2026-09-10' }),
            violationRow({ occurred_on: '2026-09-20' }),
        ];
        const { plain, statements } = await runScoped(
            (repo) => repo.earliestViolationOn(VIDEO_IDS.account),
            rowsFor({ [VIDEO_TABLES.violation]: violations }),
        );
        expect(plain).toBe('2026-09-10');
        for (const statement of statements) {
            expect(readTable(statement)).toBe(VIDEO_TABLES.violation);
            expect(statement.text).toMatch(
                /order by (?:"\w+"\.)?"occurred_on" asc limit \$\d+$/,
            );
            expect(statement.params).toContain(VIDEO_IDS.account);
            expect(limitParameter(statement)).toBe(1);
        }
    });

    it('earliestViolationOn returns null when the account has no recorded violation', async () => {
        const { plain } = await runScoped(
            (repo) => repo.earliestViolationOn(VIDEO_IDS.account),
            rowsFor({ [VIDEO_TABLES.violation]: [] }),
        );
        expect(plain).toBeNull();
    });
});

describe('PropAccountRepo reference checks', () => {
    it('finds a round in use only through an account of the caller', async () => {
        const inUse = await runScoped(
            (repo) => repo.isRoundInUse(VIDEO_IDS.round),
            rowsFor({ [TABLES.account]: [{ id: VIDEO_IDS.account }] }),
        );
        const unused = await runScoped(
            (repo) => repo.isRoundInUse(VIDEO_IDS.round),
            () => [],
        );
        expect(inUse.plain).toBe(true);
        expect(unused.plain).toBe(false);
        for (const statement of inUse.statements) {
            expect(readTable(statement)).toBe(TABLES.account);
            expect(statement.text).toContain('"round_id" = $');
            expect(statement.params).toContain(VIDEO_IDS.round);
        }
    });

    it.each([
        VIDEO_TABLES.round,
        VIDEO_TABLES.firmEngagement,
        VIDEO_TABLES.firmStatement,
    ])(
        'finds an external firm in use through a caller row of %s',
        async (table) => {
            const { plain } = await runScoped(
                (repo) => repo.isExternalFirmInUse(VIDEO_IDS.externalFirm),
                rowsFor({ [table]: [{ id: VIDEO_IDS.round }] }),
            );
            expect(plain).toBe(true);
        },
    );

    it('checks every table that can name an external firm before calling it unused', async () => {
        const { plain, statements } = await runScoped(
            (repo) => repo.isExternalFirmInUse(VIDEO_IDS.externalFirm),
            () => [],
        );
        expect(plain).toBe(false);
        expect(
            new Set(statements.map((statement) => readTable(statement))),
        ).toEqual(
            new Set([
                TABLES.account,
                VIDEO_TABLES.firmEngagement,
                VIDEO_TABLES.firmStatement,
                VIDEO_TABLES.round,
            ]),
        );
        for (const statement of statements) {
            expect(statement.text).toContain('"external_firm_id" = $');
            expect(statement.params).toContain(VIDEO_IDS.externalFirm);
        }
    });
});
