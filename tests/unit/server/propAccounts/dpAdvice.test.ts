import {
    getTableConfig,
    type IndexedColumn,
    type PgColumn,
    PgDialect,
} from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { captureError } from '~/lib/observability/logger';
import {
    DpAdviceRepo,
    MAX_DP_ADVICE_ROWS_PER_ACCOUNT,
    PROP_QUOTA_LIMITS,
} from '~/lib/prop-accounts/server';
import {
    DP_ADVICE_SOLVER_VERSION,
    type DpAdviceRow,
    DpAdviceStalenessReason,
    DpSamplesKind,
    DpSampleStage,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { PropQuota } from '~/lib/schemas/propAccountOutputs';
import { propDpAdvice } from '~/server/db/schemas/prop';

import {
    assertUserScopedWhere,
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    readTable,
} from '../fakeDatabase';
import {
    accountRow,
    callerFor,
    defined,
    dpAdviceRow,
    IDS,
    insertsInto,
    ledgerOnlyAccountRow,
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
vi.mock('~/lib/observability/logger', () => ({ captureError: vi.fn() }));
vi.mock('~/lib/observability/rate-limit', () => ({
    isWithinRateLimit: vi.fn(() => Promise.resolve(true)),
}));

const ROUTER_PATH = new URL(
    '../../../../src/server/api/routers/propAccounts/dpAdvice.ts',
    import.meta.url,
);

const NEWER_SNAPSHOT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_ACCOUNT_ID = IDS.otherAccount;
const STALE_FINGERPRINT = 'f'.repeat(64);

const TABLE_CONFIG = getTableConfig(propDpAdvice);
const DIALECT = new PgDialect();

function checkExpressions(): string[] {
    return TABLE_CONFIG.checks.map((check) =>
        DIALECT.sqlToQuery(check.value).sql.replaceAll('"', ''),
    );
}

function columnList(columns: readonly unknown[]): string {
    return columns.map((column) => (column as PgColumn).name).join(',');
}

async function currentFingerprint(): Promise<string> {
    const { caller } = callerFor(SIGNED_IN, tableResponder());
    const account = await caller.account.get({ id: IDS.account });
    return defined(account.currentPlanRulesFingerprint ?? undefined);
}

function dpQueries(queries: readonly IssuedQuery[]): IssuedQuery[] {
    return queries.filter((query) => readTable(query) === TABLES.dpAdvice);
}

async function freshRow(overrides: FakeRow = {}): Promise<FakeRow> {
    return dpAdviceRow({
        plan_rules_fingerprint: await currentFingerprint(),
        ...overrides,
    });
}

function limitParameter(query: IssuedQuery | undefined): unknown {
    const match = / limit \$(\d+)$/.exec(query?.text ?? '');
    return match?.[1] ? query?.params[Number(match[1]) - 1] : undefined;
}

function repoOver(rows: FakeRow[]) {
    const { database, queries } = createFakeDatabase((query) =>
        insertsInto([query], TABLES.dpAdvice).length > 0 ? rows : [],
    );
    return { queries, repo: new DpAdviceRepo(database, USER_ID) };
}

function storedRow(): DpAdviceRow {
    return {
        configKey: 'cd'.repeat(32),
        eligible: true,
        gaps: [],
        ineligibleReason: null,
        objective: SizingObjective.MonthlyNet,
        planRulesFingerprint: STALE_FINGERPRINT,
        planSerial: 'plan-serial',
        runtimeMs: 90_000,
        samples: {
            kind: DpSamplesKind.Sampled,
            samples: [
                {
                    cushionCents: 250_000,
                    placedRiskCents: 30_000,
                    riskCents: 40_000,
                    rungOffset: 0,
                    tradeIndex: 0,
                },
            ],
            stage: DpSampleStage.Funded,
        },
        snapshotId: IDS.snapshot,
        solvedAt: '2026-10-01T12:00:00.000Z',
        solverVersion: DP_ADVICE_SOLVER_VERSION,
        validated: false,
        validationRef: null,
    };
}

describe('propAccounts.dpAdvice.listForAccount', () => {
    it('checks the account owner first, then scopes the advice, account and snapshot reads by user id', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.dpAdvice]: [await freshRow()] }),
        );
        await caller.dpAdvice.listForAccount({ id: IDS.account });
        const account = queries.find(
            (query) => readTable(query) === TABLES.account,
        );
        assertUserScopedWhere(defined(account), USER_ID);
        expect(account?.params).toContain(IDS.account);
        const [advice] = dpQueries(queries);
        assertUserScopedWhere(defined(advice), USER_ID);
        expect(advice?.params).toContain(IDS.account);
        expect(advice?.text).toMatch(/"account_id" = \$\d+/);
        for (const read of queries) assertUserScopedWhere(read, USER_ID);
        expect(queries.indexOf(defined(account))).toBeLessThan(
            queries.indexOf(defined(advice)),
        );
    });

    it('lists the newest rows first, with the tie-break, under a hard row limit', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.dpAdvice.listForAccount({ id: IDS.account });
        const [advice] = dpQueries(queries);
        expect(advice?.text).toMatch(
            /order by "\w+"\."solved_at" desc, "\w+"\."id" desc/,
        );
        expect(limitParameter(advice)).toBe(MAX_DP_ADVICE_ROWS_PER_ACCOUNT);
    });

    it('throws NOT_FOUND for an account of another user and never reads its advice', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.account]: [] }),
        );
        await expect(
            caller.dpAdvice.listForAccount({ id: OTHER_ACCOUNT_ID }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(dpQueries(queries)).toHaveLength(0);
    });

    it('rejects an id that is not a uuid before any query', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await expect(
            caller.dpAdvice.listForAccount({ id: 'not-a-uuid' }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });

    it('returns the stored row with typed gaps and samples and no staleness when snapshot, solver and plan rules match', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.dpAdvice]: [
                    await freshRow({
                        gaps: [{ kind: 'state-at-grid-top' }],
                        validated: true,
                        validation_ref: 'dp-gate.md#7',
                    }),
                ],
            }),
        );
        const [row] = await caller.dpAdvice.listForAccount({
            id: IDS.account,
        });
        expect(row).toMatchObject({
            accountId: IDS.account,
            eligible: true,
            gaps: [{ kind: 'state-at-grid-top' }],
            id: IDS.dpAdvice,
            objective: SizingObjective.MonthlyNet,
            solverVersion: DP_ADVICE_SOLVER_VERSION,
            staleness: [],
            userId: USER_ID,
            validated: true,
            validationRef: 'dp-gate.md#7',
        });
        expect(row?.samples.kind).toBe(DpSamplesKind.Sampled);
    });

    it.each([
        [
            'a newer snapshot',
            { snapshot_id: IDS.snapshot },
            { [TABLES.snapshot]: [snapshotRow({ id: NEWER_SNAPSHOT_ID })] },
            DpAdviceStalenessReason.NewerSnapshot,
        ],
        [
            'a different solver version',
            { solver_version: DP_ADVICE_SOLVER_VERSION + 1 },
            {},
            DpAdviceStalenessReason.SolverVersionChanged,
        ],
        [
            'changed plan rules',
            { plan_rules_fingerprint: STALE_FINGERPRINT },
            {},
            DpAdviceStalenessReason.PlanRulesChanged,
        ],
    ])(
        'flags %s as the only staleness reason',
        async (_name, rowOverrides, tables, reason) => {
            const { caller } = callerFor(
                SIGNED_IN,
                tableResponder({
                    [TABLES.dpAdvice]: [await freshRow(rowOverrides)],
                    ...tables,
                }),
            );
            const [row] = await caller.dpAdvice.listForAccount({
                id: IDS.account,
            });
            expect(row?.staleness).toEqual([reason]);
        },
    );

    it('flags advice of an account whose plan can no longer be resolved as changed plan rules', async () => {
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [ledgerOnlyAccountRow()],
                [TABLES.dpAdvice]: [
                    dpAdviceRow({ plan_rules_fingerprint: STALE_FINGERPRINT }),
                ],
            }),
        );
        const [row] = await caller.dpAdvice.listForAccount({
            id: IDS.account,
        });
        expect(row?.staleness).toEqual([
            DpAdviceStalenessReason.PlanRulesChanged,
        ]);
    });

    it('skips a row with unreadable stored gaps, samples or value samples and reports it without the row content', async () => {
        vi.mocked(captureError).mockClear();
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.dpAdvice]: [
                    dpAdviceRow({ gaps: [{ kind: 'not-a-gap' }] }),
                    dpAdviceRow({ id: NEWER_SNAPSHOT_ID, samples: 42 }),
                    dpAdviceRow({
                        id: OTHER_ACCOUNT_ID,
                        value_samples: { kind: 'current' },
                    }),
                    await freshRow({ id: IDS.decision }),
                ],
            }),
        );
        const rows = await caller.dpAdvice.listForAccount({
            id: IDS.account,
        });
        expect(rows.map((row) => row.id)).toEqual([IDS.decision]);
        expect(captureError).toHaveBeenCalledTimes(3);
        for (const [error, options] of vi.mocked(captureError).mock.calls) {
            expect(JSON.stringify([String(error), options])).not.toContain(
                'not-a-gap',
            );
        }
    });
});

describe('propAccounts.dpAdvice.latestForAll', () => {
    it('reads the newest row of each account under the user scope, keyed by the same index order', async () => {
        const { caller, queries } = callerFor(SIGNED_IN, tableResponder());
        await caller.dpAdvice.latestForAll();
        const [advice] = dpQueries(queries);
        assertUserScopedWhere(defined(advice), USER_ID);
        expect(advice?.text).toMatch(
            /^select distinct on \((?:"\w+"\.)?"account_id"\)/,
        );
        expect(advice?.text).toMatch(
            /order by (?:"\w+"\.)?"account_id", (?:"\w+"\.)?"solved_at" desc, (?:"\w+"\.)?"id" desc/,
        );
        expect(limitParameter(advice)).toBe(
            PROP_QUOTA_LIMITS[PropQuota.Accounts],
        );
        for (const read of queries) assertUserScopedWhere(read, USER_ID);
    });

    it('judges each row against the latest snapshot and plan rules of its own account', async () => {
        const fingerprint = await currentFingerprint();
        const { caller } = callerFor(
            SIGNED_IN,
            tableResponder({
                [TABLES.account]: [
                    accountRow(),
                    accountRow({ id: OTHER_ACCOUNT_ID, label: 'Eval two' }),
                ],
                [TABLES.dpAdvice]: [
                    dpAdviceRow({ plan_rules_fingerprint: fingerprint }),
                    dpAdviceRow({
                        account_id: OTHER_ACCOUNT_ID,
                        id: IDS.decision,
                        plan_rules_fingerprint: fingerprint,
                    }),
                ],
                [TABLES.snapshot]: [
                    snapshotRow(),
                    snapshotRow({
                        account_id: OTHER_ACCOUNT_ID,
                        id: NEWER_SNAPSHOT_ID,
                    }),
                ],
            }),
        );
        const rows = await caller.dpAdvice.latestForAll();
        expect(rows.map((row) => [row.accountId, row.staleness])).toEqual([
            [IDS.account, []],
            [OTHER_ACCOUNT_ID, [DpAdviceStalenessReason.NewerSnapshot]],
        ]);
    });

    it('returns an empty list without reading accounts or snapshots when nothing was solved', async () => {
        const { caller, queries } = callerFor(
            SIGNED_IN,
            tableResponder({ [TABLES.dpAdvice]: [] }),
        );
        expect(await caller.dpAdvice.latestForAll()).toEqual([]);
        expect(queries).toHaveLength(1);
    });
});

describe('DpAdviceRepo.record', () => {
    it('inserts under the repository user, skips an existing key, and returns the stored row', async () => {
        const { queries, repo } = repoOver([dpAdviceRow()]);
        const stored = await repo.record(IDS.account, storedRow(), []);
        expect(stored?.id).toBe(IDS.dpAdvice);
        const [insert] = insertsInto(queries, TABLES.dpAdvice);
        expect(insert?.text).toMatch(/\son conflict do nothing\s/);
        expect(insert?.params).toEqual(
            expect.arrayContaining([
                USER_ID,
                IDS.account,
                IDS.snapshot,
                'cd'.repeat(32),
                DP_ADVICE_SOLVER_VERSION,
                90_000,
            ]),
        );
        expect(insert?.text).not.toMatch(/"user_id" = /);
    });

    it('returns null when the idempotency key already holds a row', async () => {
        const { repo } = repoOver([]);
        expect(await repo.record(IDS.account, storedRow(), [])).toBeNull();
    });
});

describe('propDpAdvice table', () => {
    it('keys the row to its account and its snapshot by same-owner composite foreign keys that cascade', () => {
        const byColumns = new Map(
            TABLE_CONFIG.foreignKeys.map((foreignKey) => {
                const reference = foreignKey.reference();
                return [
                    columnList(reference.columns),
                    {
                        foreign: columnList(reference.foreignColumns),
                        onDelete: foreignKey.onDelete,
                        table: getTableConfig(reference.foreignTable).name,
                    },
                ] as const;
            }),
        );
        expect(byColumns.get('account_id,user_id')).toEqual({
            foreign: 'id,user_id',
            onDelete: 'cascade',
            table: 'sadranl_prop_account',
        });
        expect(byColumns.get('snapshot_id,account_id,user_id')).toEqual({
            foreign: 'id,account_id,user_id',
            onDelete: 'cascade',
            table: 'sadranl_prop_account_snapshot',
        });
        expect(byColumns.get('user_id')).toMatchObject({ onDelete: 'cascade' });
        expect(byColumns.has('account_id')).toBe(false);
        expect(byColumns.has('snapshot_id')).toBe(false);
    });

    it('requires the owner, account, snapshot and keys, with no default on the solver version', () => {
        for (const name of [
            'account_id',
            'config_key',
            'eligible',
            'objective',
            'plan_serial',
            'runtime_ms',
            'samples',
            'snapshot_id',
            'solved_at',
            'solver_version',
            'user_id',
            'validated',
        ]) {
            const column = TABLE_CONFIG.columns.find(
                (candidate) => candidate.name === name,
            );
            expect(column?.notNull, name).toBe(true);
        }
        expect(
            TABLE_CONFIG.columns.find(
                (column) => column.name === 'solver_version',
            )?.hasDefault,
        ).toBe(false);
    });

    it('serves the newest-first reads with one index led by user and account, in the DISTINCT ON order', () => {
        const index = TABLE_CONFIG.indexes.find(
            (candidate) =>
                candidate.config.name ===
                'prop_dp_advice_user_account_solved_idx',
        );
        expect(
            index?.config.columns.map((column) => {
                const indexed = column as IndexedColumn;
                return `${(column as PgColumn).name} ${indexed.indexConfig.order ?? 'asc'} nulls ${indexed.indexConfig.nulls ?? 'last'}`;
            }),
        ).toEqual([
            'user_id asc nulls last',
            'account_id asc nulls last',
            'solved_at desc nulls first',
            'id desc nulls first',
        ]);
    });

    it('makes one row per user, account, snapshot, config key and solver version', () => {
        const index = TABLE_CONFIG.indexes.find(
            (candidate) => candidate.config.unique,
        );
        expect(columnList(defined(index).config.columns)).toBe(
            'user_id,account_id,snapshot_id,config_key,solver_version',
        );
    });

    it('checks the runtime, the solver version, the key shape, the validation pairing and the jsonb shapes in the database', () => {
        const expressions = checkExpressions().join('\n');
        for (const fragment of [
            'runtime_ms',
            'solver_version',
            'config_key',
            'ineligible_reason',
            'validation_ref',
            'jsonb_typeof',
            'jsonb_array_length',
        ]) {
            expect(expressions, fragment).toContain(fragment);
        }
    });
});

describe('propAccounts dpAdvice router', () => {
    it('keeps no query of its own: every read goes through a repository', () => {
        const source = readFileSync(ROUTER_PATH, 'utf8');
        expect(source).not.toMatch(/\.select\(/);
        expect(source).not.toMatch(/\.insert\(/);
        expect(source).not.toMatch(/\.update\(/);
        expect(source).not.toMatch(/\.delete\(/);
    });
});
