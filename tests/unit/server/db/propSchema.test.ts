import { is, SQL } from 'drizzle-orm';
import {
    type ForeignKey,
    getTableConfig,
    type IndexedColumn,
    type PgColumn,
    PgDialect,
    PgTable,
} from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    FirmEngagementReason,
    FirmEngagementStatus,
    MAX_ACCOUNT_DATE_YEAR,
    MAX_PLAN_SERIAL_LENGTH,
    MIN_ACCOUNT_DATE_YEAR,
    PayoutStatus,
    RoundStatus,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, serializePlanId } from '~/lib/prop-calculator';
import { MAX_ACCEPTED_RUNGS } from '~/lib/schemas/propAccounts';
import { user } from '~/server/db/schemas/auth';
import * as propSchema from '~/server/db/schemas/prop';
import {
    type PropAccountEventRow,
    type PropAccountRow,
    type PropRulebookRow,
} from '~/server/db/schemas/prop';

import { createFakeDatabase } from '../fakeDatabase';

type TableConfig = ReturnType<typeof getTableConfig>;

const TABLES = (Object.values(propSchema) as unknown[]).filter(
    (value): value is PgTable => is(value, PgTable),
);

const CONFIGS = TABLES.map((table) => getTableConfig(table));

const USER_TABLE_NAME = getTableConfig(user).name;
const ACCOUNT_TABLE = 'sadranl_prop_account';
const ACCOUNT_CHILD_TABLES = [
    'sadranl_prop_account_snapshot',
    'sadranl_prop_payout',
    'sadranl_prop_fee',
    'sadranl_prop_account_event',
    'sadranl_prop_sizing_decision',
    'sadranl_prop_rule_violation',
];
const BANKROLL_TABLE = 'sadranl_prop_bankroll_transfer';
const EXTERNAL_FIRM_TABLE = 'sadranl_prop_external_firm';
const ROUND_TABLE = 'sadranl_prop_round';
const ENGAGEMENT_TABLE = 'sadranl_prop_firm_engagement';
const STATEMENT_TABLE = 'sadranl_prop_firm_statement';
const VIOLATION_TABLE = 'sadranl_prop_rule_violation';
const DECISION_TABLE = 'sadranl_prop_sizing_decision';
const PAYOUT_TABLE = 'sadranl_prop_payout';
const ENUM_COLUMNS = new Set([
    'basis',
    'dashboard_convention',
    'firm_id',
    'kind',
    'source',
    'stage',
    'status',
]);

const DIALECT = new PgDialect();
const POSTGRES_NAME_LIMIT = 63;
const SNAPSHOT_TABLE = 'sadranl_prop_account_snapshot';
const SIGNED_CENTS_COLUMNS = new Set([
    `${SNAPSHOT_TABLE}.balance_at_last_payout_cents`,
    `${SNAPSHOT_TABLE}.balance_cents`,
    `${SNAPSHOT_TABLE}.dashboard_floor_cents`,
    `${SNAPSHOT_TABLE}.floor_at_last_payout_cents`,
    `${SNAPSHOT_TABLE}.highest_eod_balance_cents`,
    `${SNAPSHOT_TABLE}.highest_intraday_balance_cents`,
    `${VIOLATION_TABLE}.cost_cents`,
]);

const ACCOUNT_DATE_GATE =
    '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';

function accountDateCheck(column: string): string {
    return `${column} IS NULL OR CASE WHEN ${column} ~ '${ACCOUNT_DATE_GATE}' THEN to_char(make_date(substr(${column}, 1, 4)::integer, substr(${column}, 6, 2)::integer, 1) + (substr(${column}, 9, 2)::integer - 1), 'YYYY-MM-DD') = ${column} ELSE false END`;
}

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

function checkExpressions(config: TableConfig): string[] {
    return config.checks.map((check) =>
        DIALECT.sqlToQuery(check.value)
            .sql.replaceAll(/"\w+"\./g, '')
            .replaceAll('"', '')
            .replaceAll(/\s+/g, ' ')
            .trim(),
    );
}

function columnList(columns: readonly unknown[]): string {
    return columns.map((column) => (column as PgColumn).name).join(',');
}

function columnNamed(config: TableConfig, name: string): PgColumn {
    const column = config.columns.find((candidate) => candidate.name === name);
    if (column === undefined) throw new Error(`${config.name} has no ${name}`);
    return column;
}

function configNamed(name: string): TableConfig {
    const config = CONFIGS.find((candidate) => candidate.name === name);
    if (config === undefined) throw new Error(`missing table ${name}`);
    return config;
}

function foreignKeyOn(config: TableConfig, columns: string): ForeignKey {
    const foreignKey = config.foreignKeys.find(
        (candidate) => columnList(candidate.reference().columns) === columns,
    );
    if (foreignKey === undefined) {
        throw new Error(`${config.name} has no foreign key on ${columns}`);
    }
    return foreignKey;
}

function indexColumnLists(config: TableConfig): string[] {
    return config.indexes.map((index) => columnList(index.config.columns));
}

function indexedColumnLists(config: TableConfig): string[][] {
    const primary = config.columns
        .filter((column) => column.primary)
        .map((column) => column.name);
    return [
        ...config.indexes.map((index) =>
            index.config.columns.map((column) => (column as PgColumn).name),
        ),
        ...config.uniqueConstraints.map((constraint) =>
            constraint.columns.map((column) => column.name),
        ),
        ...config.primaryKeys.map((key) =>
            key.columns.map((column) => column.name),
        ),
        ...(primary.length > 0 ? [primary] : []),
    ];
}

function indexNamed(config: TableConfig, name: string) {
    const index = config.indexes.find(
        (candidate) => candidate.config.name === name,
    );
    if (index === undefined) throw new Error(`${config.name} has no ${name}`);
    return index;
}

function isLedByIndex(
    config: TableConfig,
    columns: readonly string[],
): boolean {
    const wanted = new Set(columns);
    return indexedColumnLists(config).some(
        (indexed) =>
            indexed.length >= wanted.size &&
            indexed.slice(0, wanted.size).every((name) => wanted.has(name)),
    );
}

function sqlText(value: unknown): string {
    return DIALECT.sqlToQuery(value as SQL)
        .sql.replaceAll(/"\w+"\./g, '')
        .replaceAll('"', '')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

function uniqueConstraintLists(config: TableConfig): string[] {
    return config.uniqueConstraints.map((constraint) =>
        columnList(constraint.columns),
    );
}

describe('prop schema', () => {
    it('defines exactly the 16 prop tables', () => {
        expect(CONFIGS.map((config) => config.name).toSorted(byName)).toEqual(
            [
                'sadranl_prop_account',
                'sadranl_prop_account_event',
                'sadranl_prop_account_snapshot',
                BANKROLL_TABLE,
                'sadranl_prop_copy_group',
                'sadranl_prop_dp_advice',
                EXTERNAL_FIRM_TABLE,
                'sadranl_prop_fee',
                ENGAGEMENT_TABLE,
                STATEMENT_TABLE,
                'sadranl_prop_payout',
                ROUND_TABLE,
                VIOLATION_TABLE,
                'sadranl_prop_rulebook',
                'sadranl_prop_saved_scenario',
                'sadranl_prop_sizing_decision',
            ].toSorted(byName),
        );
    });

    it('prefixes every table name with sadranl_prop_', () => {
        for (const config of CONFIGS) {
            expect(config.name.startsWith('sadranl_prop_')).toBe(true);
        }
    });

    it('gives every table a not-null user_id with an FK to user.id on delete cascade', () => {
        for (const config of CONFIGS) {
            const userId = config.columns.find((c) => c.name === 'user_id');
            expect(userId?.notNull, config.name).toBe(true);
            const userForeignKey = foreignKeyOn(config, 'user_id');
            const reference = userForeignKey.reference();
            expect(getTableConfig(reference.foreignTable).name).toBe(
                USER_TABLE_NAME,
            );
            expect(columnList(reference.foreignColumns)).toBe('id');
            expect(userForeignKey.onDelete, config.name).toBe('cascade');
        }
    });

    it('makes user_id the primary key of the rulebook', () => {
        const rulebook = configNamed('sadranl_prop_rulebook');
        const userId = rulebook.columns.find((c) => c.name === 'user_id');
        expect(userId?.primary).toBe(true);
        expect(rulebook.columns.some((c) => c.name === 'id')).toBe(false);
    });

    it('gives every other table a uuid primary key', () => {
        for (const config of CONFIGS) {
            if (config.name === 'sadranl_prop_rulebook') continue;
            const id = config.columns.find((c) => c.name === 'id');
            expect(id?.primary, config.name).toBe(true);
            expect(id?.getSQLType(), config.name).toBe('uuid');
        }
    });

    it('puts user_id first in every unique index', () => {
        let uniqueIndexes = 0;
        for (const config of CONFIGS) {
            for (const index of config.indexes) {
                if (!index.config.unique) continue;
                uniqueIndexes += 1;
                expect(
                    (index.config.columns[0] as PgColumn | undefined)?.name,
                    `${config.name} ${index.config.name ?? ''}`,
                ).toBe('user_id');
            }
        }
        expect(uniqueIndexes).toBeGreaterThanOrEqual(3);
    });

    it('stores every _cents column as an integer or an integer array', () => {
        let centsColumns = 0;
        for (const config of CONFIGS) {
            for (const column of config.columns) {
                if (!column.name.endsWith('_cents')) continue;
                centsColumns += 1;
                expect(
                    ['integer', 'integer[]'],
                    `${config.name}.${column.name}`,
                ).toContain(column.getSQLType());
            }
        }
        expect(centsColumns).toBeGreaterThanOrEqual(15);
    });

    it('keys account children to prop_account by (account_id, user_id) on delete cascade', () => {
        for (const name of ACCOUNT_CHILD_TABLES) {
            const config = configNamed(name);
            const composite = foreignKeyOn(config, 'account_id,user_id');
            const reference = composite.reference();
            expect(getTableConfig(reference.foreignTable).name).toBe(
                ACCOUNT_TABLE,
            );
            expect(columnList(reference.foreignColumns)).toBe('id,user_id');
            expect(composite.onDelete).toBe('cascade');
            expect(
                config.columns.find((c) => c.name === 'account_id')?.notNull,
            ).toBe(true);
        }
    });

    it('declares the composite FK targets as unique constraints, not indexes', () => {
        for (const name of [
            ACCOUNT_TABLE,
            'sadranl_prop_copy_group',
            EXTERNAL_FIRM_TABLE,
            ROUND_TABLE,
        ]) {
            const config = configNamed(name);
            expect(
                config.uniqueConstraints.some(
                    (constraint) =>
                        columnList(constraint.columns) === 'id,user_id',
                ),
                name,
            ).toBe(true);
            expect(indexColumnLists(config), name).not.toContain('id,user_id');
        }
    });

    it('makes the label unique per user among unarchived accounts only', () => {
        const labelIndex = configNamed(ACCOUNT_TABLE).indexes.find(
            (index) => columnList(index.config.columns) === 'user_id,label',
        );
        expect(labelIndex?.config.unique).toBe(true);
        expect(labelIndex?.config.where).toBeDefined();
    });

    it('keys the nullable references to rows of the same owner with composite no-action FKs', () => {
        const account = configNamed(ACCOUNT_TABLE);
        const decision = configNamed('sadranl_prop_sizing_decision');
        const round = configNamed(ROUND_TABLE);
        const engagement = configNamed(ENGAGEMENT_TABLE);
        const statement = configNamed(STATEMENT_TABLE);
        const violation = configNamed(VIOLATION_TABLE);
        const cases: [TableConfig, string, string, string, string][] = [
            [
                account,
                'round_id,user_id',
                ROUND_TABLE,
                'id,user_id',
                'round_id',
            ],
            [
                round,
                'external_firm_id,user_id',
                EXTERNAL_FIRM_TABLE,
                'id,user_id',
                'external_firm_id',
            ],
            [
                engagement,
                'external_firm_id,user_id',
                EXTERNAL_FIRM_TABLE,
                'id,user_id',
                'external_firm_id',
            ],
            [
                statement,
                'external_firm_id,user_id',
                EXTERNAL_FIRM_TABLE,
                'id,user_id',
                'external_firm_id',
            ],
            [
                account,
                'external_firm_id,user_id',
                EXTERNAL_FIRM_TABLE,
                'id,user_id',
                'external_firm_id',
            ],
            [
                violation,
                'decision_id,account_id,user_id',
                DECISION_TABLE,
                'id,account_id,user_id',
                'decision_id',
            ],
            [
                account,
                'copy_group_id,user_id',
                'sadranl_prop_copy_group',
                'id,user_id',
                'copy_group_id',
            ],
            [
                account,
                'replaces_account_id,user_id',
                ACCOUNT_TABLE,
                'id,user_id',
                'replaces_account_id',
            ],
            [
                decision,
                'snapshot_id,account_id,user_id',
                SNAPSHOT_TABLE,
                'id,account_id,user_id',
                'snapshot_id',
            ],
        ];
        for (const [
            config,
            columns,
            target,
            targetColumns,
            nullable,
        ] of cases) {
            const foreignKey = foreignKeyOn(config, columns);
            const reference = foreignKey.reference();
            expect(getTableConfig(reference.foreignTable).name, columns).toBe(
                target,
            );
            expect(columnList(reference.foreignColumns), columns).toBe(
                targetColumns,
            );
            expect(foreignKey.onDelete, columns).toBe('no action');
            expect(
                config.columns.find((c) => c.name === nullable)?.notNull,
            ).toBe(false);
            expect(
                config.foreignKeys.some(
                    (candidate) =>
                        columnList(candidate.reference().columns) === nullable,
                ),
                `${nullable} must not keep a single-column FK`,
            ).toBe(false);
        }
    });

    it('declares the snapshot (id, account_id, user_id) target as a unique constraint, not an index', () => {
        const snapshot = configNamed(SNAPSHOT_TABLE);
        expect(
            snapshot.uniqueConstraints.map((constraint) =>
                columnList(constraint.columns),
            ),
        ).toContain('id,account_id,user_id');
        expect(indexColumnLists(snapshot)).not.toContain(
            'id,account_id,user_id',
        );
    });

    it('names the copy group target constraint that the account FK references', () => {
        const names = configNamed(
            'sadranl_prop_copy_group',
        ).uniqueConstraints.map((constraint) => constraint.getName());
        expect(names).toContain('prop_copy_group_id_user_id_uq');
    });

    it('keeps every constraint name within the 63-character Postgres limit', () => {
        let named = 0;
        for (const config of CONFIGS) {
            const names = [
                ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
                ...config.indexes.map((index) => index.config.name ?? ''),
                ...config.uniqueConstraints.map(
                    (constraint) => constraint.getName() ?? '',
                ),
                ...config.checks.map((check) => check.name),
            ];
            for (const name of names) {
                named += 1;
                expect(name.length, name).toBeGreaterThan(0);
                expect(name.length, name).toBeLessThanOrEqual(
                    POSTGRES_NAME_LIMIT,
                );
            }
        }
        expect(named).toBeGreaterThan(40);
    });

    it('checks money invariants in the database', () => {
        const cases: [string, string][] = [
            [BANKROLL_TABLE, 'amount_cents > 0'],
            [ROUND_TABLE, 'budget_cents > 0'],
            [STATEMENT_TABLE, 'reported_payout_cents >= 0'],
            ['sadranl_prop_fee', 'amount_cents >= 0'],
            ['sadranl_prop_payout', 'gross_cents > 0'],
            [
                'sadranl_prop_payout',
                'net_cents IS NULL OR (net_cents >= 0 AND net_cents <= gross_cents)',
            ],
            [ACCOUNT_TABLE, 'live_start_balance_cents >= 0'],
            [SNAPSHOT_TABLE, 'cumulative_payout_cents >= 0'],
            [SNAPSHOT_TABLE, 'cycle_best_day_profit_cents >= 0'],
            [SNAPSHOT_TABLE, 'eval_best_day_profit_cents >= 0'],
            ['sadranl_prop_sizing_decision', 'accepted_risk_cents >= 0'],
            ['sadranl_prop_sizing_decision', 'headline_risk_cents >= 0'],
            ['sadranl_prop_sizing_decision', 'actual_risk_cents >= 0'],
            ['sadranl_prop_sizing_decision', '0 < ALL(accepted_rungs_cents)'],
        ];
        for (const [table, expression] of cases) {
            expect(checkExpressions(configNamed(table)), table).toContain(
                expression,
            );
        }
    });

    it('checks every cents column except the signed dashboard-relative snapshot values', () => {
        const unchecked: string[] = [];
        for (const config of CONFIGS) {
            const expressions = checkExpressions(config).join(' ');
            for (const column of config.columns) {
                if (!column.name.endsWith('_cents')) continue;
                const qualified = `${config.name}.${column.name}`;
                const isChecked = new RegExp(
                    String.raw`\b${column.name}\b`,
                ).test(expressions);
                if (SIGNED_CENTS_COLUMNS.has(qualified)) {
                    expect(isChecked, qualified).toBe(false);
                } else if (!isChecked) {
                    unchecked.push(qualified);
                }
            }
        }
        expect(unchecked).toEqual([]);
    });

    it('sizes plan_serial for the longest registry serial', () => {
        const longest = Math.max(
            ...ALL_FIRMS.flatMap((firm) =>
                firm.plans.map((plan) => serializePlanId(plan.id).length),
            ),
        );
        const column = configNamed(ACCOUNT_TABLE).columns.find(
            (c) => c.name === 'plan_serial',
        );
        expect(column?.getSQLType()).toBe(`varchar(${MAX_PLAN_SERIAL_LENGTH})`);
        expect(longest).toBeLessThanOrEqual(MAX_PLAN_SERIAL_LENGTH);
    });

    it('indexes accounts by the account.list filters, not by status', () => {
        const indexes = indexColumnLists(configNamed(ACCOUNT_TABLE));
        expect(indexes).toContain('user_id,stage');
        expect(indexes).toContain('user_id,firm_id');
        expect(indexes).not.toContain('user_id,status');
    });

    it('wires every prop table into the database schema', () => {
        const { database } = createFakeDatabase(() => []);
        for (const key of [
            'propAccount',
            'propAccountEvent',
            'propAccountSnapshot',
            'propBankrollTransfer',
            'propCopyGroup',
            'propDpAdvice',
            'propExternalFirm',
            'propFee',
            'propFirmEngagement',
            'propFirmStatement',
            'propPayout',
            'propRound',
            'propRuleViolation',
            'propRulebook',
            'propSavedScenario',
            'propSizingDecision',
        ] as const) {
            expect(
                (database.query as Record<string, unknown>)[key],
                key,
            ).toBeDefined();
        }
    });

    it('indexes events by (user_id, occurred_on) and by (user_id, account_id, occurred_on)', () => {
        const indexes = indexColumnLists(
            configNamed('sadranl_prop_account_event'),
        );
        expect(indexes).toContain('user_id,occurred_on');
        expect(indexes).toContain('user_id,account_id,occurred_on');
    });

    it('leads some index with the columns of every foreign key', () => {
        const unindexed: string[] = [];
        for (const config of CONFIGS) {
            for (const foreignKey of config.foreignKeys) {
                const columns = foreignKey
                    .reference()
                    .columns.map((column) => column.name);
                if (!isLedByIndex(config, columns)) {
                    unindexed.push(`${config.name}(${columns.join(',')})`);
                }
            }
        }
        expect(unindexed).toEqual([]);
    });

    it('indexes the nullable references only where they are set', () => {
        const cases: [string, string][] = [
            [ACCOUNT_TABLE, 'copy_group_id,user_id'],
            [ACCOUNT_TABLE, 'replaces_account_id,user_id'],
            [ACCOUNT_TABLE, 'round_id,user_id'],
            [ACCOUNT_TABLE, 'external_firm_id,user_id'],
            ['sadranl_prop_sizing_decision', 'snapshot_id,account_id,user_id'],
            [ROUND_TABLE, 'external_firm_id,user_id'],
            [VIOLATION_TABLE, 'decision_id,account_id,user_id'],
        ];
        for (const [name, column] of cases) {
            const index = configNamed(name).indexes.find(
                (candidate) => columnList(candidate.config.columns) === column,
            );
            expect(index?.config.where, `${name}.${column}`).toBeDefined();
        }
    });

    it('indexes fees by (user_id, account_id) like payouts', () => {
        expect(indexColumnLists(configNamed('sadranl_prop_fee'))).toContain(
            'user_id,account_id',
        );
    });

    it('types stored jsonb by its stored shape, so missing keys are visible to readers', () => {
        expectTypeOf<
            PropAccountRow['optIns']['takesFundedReset']
        >().toEqualTypeOf<boolean | undefined>();
        expectTypeOf<PropAccountEventRow['detail']['note']>().toEqualTypeOf<
            null | string | undefined
        >();
        expectTypeOf<
            PropRulebookRow['parameters']['schemaVersion']
        >().toEqualTypeOf<1 | undefined>();
        expectTypeOf<
            NonNullable<PropRulebookRow['parameters']['funded']>['riskCents']
        >().toEqualTypeOf<number | undefined>();
    });

    it('indexes snapshots by (user_id, account_id, as_of) with a deterministic tie-breaker', () => {
        expect(indexColumnLists(configNamed(SNAPSHOT_TABLE))).toContain(
            'user_id,account_id,as_of,created_at,id',
        );
    });

    it('rejects NULL elements in accepted_rungs_cents together with the positive check', () => {
        const expressions = checkExpressions(
            configNamed('sadranl_prop_sizing_decision'),
        );
        expect(expressions).toContain('0 < ALL(accepted_rungs_cents)');
        expect(expressions).toContain(
            'array_position(accepted_rungs_cents, NULL) IS NULL',
        );
    });

    it('rejects an account that replaces itself in the database', () => {
        expect(checkExpressions(configNamed(ACCOUNT_TABLE))).toContain(
            'replaces_account_id <> id',
        );
    });

    it('checks every snapshot counter non-negative', () => {
        const snapshot = configNamed(SNAPSHOT_TABLE);
        const expressions = checkExpressions(snapshot);
        const counters = snapshot.columns
            .filter(
                (column) =>
                    column.getSQLType() === 'integer' &&
                    !column.name.endsWith('_cents'),
            )
            .map((column) => column.name)
            .toSorted(byName);
        expect(counters).toEqual(
            [
                'payouts_taken',
                'qualifying_days_since_last_payout',
                'trading_days',
            ].toSorted(byName),
        );
        for (const counter of counters) {
            expect(expressions, counter).toContain(`${counter} >= 0`);
        }
    });

    it('orders the snapshot index newest first, matching a plain ORDER BY ... DESC, to serve latestForAll and listForAccount', () => {
        const index = configNamed(SNAPSHOT_TABLE).indexes.find(
            (candidate) =>
                columnList(candidate.config.columns) ===
                'user_id,account_id,as_of,created_at,id',
        );
        expect(
            index?.config.columns.map((column) => {
                const indexed = column as IndexedColumn;
                return `${indexed.name ?? ''} ${indexed.indexConfig.order ?? 'asc'} nulls ${indexed.indexConfig.nulls ?? 'last'}`;
            }),
        ).toEqual([
            'user_id asc nulls last',
            'account_id asc nulls last',
            'as_of desc nulls first',
            'created_at desc nulls first',
            'id desc nulls first',
        ]);
    });

    it('gives no enum column a DB default and requires it, except the firm id paired with an external firm', () => {
        let enumColumns = 0;
        for (const config of CONFIGS) {
            const hasExternalFirm = config.columns.some(
                (column) => column.name === 'external_firm_id',
            );
            for (const column of config.columns) {
                if (!ENUM_COLUMNS.has(column.name)) continue;
                enumColumns += 1;
                expect(column.hasDefault, `${config.name}.${column.name}`).toBe(
                    false,
                );
                expect(column.notNull, `${config.name}.${column.name}`).toBe(
                    !(hasExternalFirm && column.name === 'firm_id'),
                );
            }
        }
        expect(enumColumns).toBeGreaterThanOrEqual(19);
    });

    it('gives no varchar column a DB default except the account tracking backfill', () => {
        for (const config of CONFIGS) {
            for (const column of config.columns) {
                if (!column.getSQLType().startsWith('varchar')) continue;
                const qualified = `${config.name}.${column.name}`;
                expect(column.hasDefault, qualified).toBe(
                    qualified === `${ACCOUNT_TABLE}.tracking`,
                );
            }
        }
    });

    it('stores dates as 10-character ISO strings', () => {
        const dateColumns = CONFIGS.flatMap((config) =>
            config.columns.filter(
                (column) =>
                    column.name.endsWith('_on') || column.name === 'as_of',
            ),
        );
        expect(dateColumns.length).toBeGreaterThanOrEqual(19);
        for (const column of dateColumns) {
            expect(column.getSQLType(), column.name).toBe('varchar(10)');
        }
    });

    it('checks every date column holds a real ISO calendar date from 2000 through 2100', () => {
        expect([MIN_ACCOUNT_DATE_YEAR, MAX_ACCOUNT_DATE_YEAR]).toEqual([
            2000, 2100,
        ]);
        let dateColumns = 0;
        for (const config of CONFIGS) {
            const expressions = checkExpressions(config);
            for (const column of config.columns) {
                if (!column.name.endsWith('_on') && column.name !== 'as_of') {
                    continue;
                }
                dateColumns += 1;
                expect(expressions, `${config.name}.${column.name}`).toContain(
                    accountDateCheck(column.name),
                );
            }
        }
        expect(dateColumns).toBe(19);
    });

    it('gates every date CHECK so no value can raise a cast error instead of a check violation', () => {
        const gate = new RegExp(ACCOUNT_DATE_GATE);
        for (const admitted of [
            '2000-01-01',
            '2026-02-29',
            '2026-04-31',
            '2100-12-31',
        ]) {
            expect(gate.test(admitted), admitted).toBe(true);
        }
        for (const refused of [
            '2026-13-01',
            '2026-00-10',
            '2026-01-00',
            '2026-01-32',
            '1999-12-31',
            '2101-01-01',
            '2026-9-01',
        ]) {
            expect(gate.test(refused), refused).toBe(false);
        }
        const dateChecks = CONFIGS.flatMap(checkExpressions).filter(
            (expression) => expression.includes(ACCOUNT_DATE_GATE),
        );
        expect(dateChecks).toHaveLength(19);
        for (const expression of dateChecks) {
            expect(expression).not.toMatch(/::date\b/);
        }
    });

    it('ties a payout paid date to the Paid status and keeps it on or after the request', () => {
        const expressions = checkExpressions(
            configNamed('sadranl_prop_payout'),
        );
        expect(expressions).toContain(
            `(status = '${PayoutStatus.Paid}') = (paid_on IS NOT NULL)`,
        );
        expect(expressions).toContain(
            'paid_on IS NULL OR paid_on >= requested_on',
        );
    });

    it('bounds accepted_rungs_cents to one dimension of at most 20 rungs', () => {
        const expressions = checkExpressions(
            configNamed('sadranl_prop_sizing_decision'),
        );
        expect(expressions).toContain(
            `cardinality(accepted_rungs_cents) <= ${MAX_ACCEPTED_RUNGS}`,
        );
        expect(expressions).toContain(
            'COALESCE(array_ndims(accepted_rungs_cents), 1) = 1',
        );
    });
});

describe('prop schema: video record tables', () => {
    it('keeps bankroll transfers by kind, a positive amount and a real date, indexed by (user_id, occurred_on)', () => {
        const bankroll = configNamed(BANKROLL_TABLE);
        expect(columnNamed(bankroll, 'kind').notNull).toBe(true);
        expect(columnNamed(bankroll, 'amount_cents').notNull).toBe(true);
        expect(columnNamed(bankroll, 'occurred_on').notNull).toBe(true);
        expect(columnNamed(bankroll, 'note').notNull).toBe(false);
        expect(checkExpressions(bankroll)).toContain('amount_cents > 0');
        expect(indexColumnLists(bankroll)).toContain('user_id,occurred_on');
    });

    it('names an external firm with 1 to 64 characters, unique per user ignoring letter case', () => {
        const firm = configNamed(EXTERNAL_FIRM_TABLE);
        expect(columnNamed(firm, 'name').getSQLType()).toBe('varchar(64)');
        expect(columnNamed(firm, 'name').notNull).toBe(true);
        expect(columnNamed(firm, 'notes').notNull).toBe(false);
        expect(checkExpressions(firm)).toContain('char_length(name) > 0');
        expect(uniqueConstraintLists(firm)).toContain('id,user_id');
        const byName = indexNamed(firm, 'prop_external_firm_user_name_idx');
        expect(byName.config.unique).toBe(true);
        expect(byName.config.where).toBeUndefined();
        expect(
            byName.config.columns.map((column) =>
                is(column, SQL) ? sqlText(column) : (column as PgColumn).name,
            ),
        ).toEqual(['user_id', 'lower(name)']);
    });

    it('gives a round a per-user unique label, at most one firm column, a checked budget and matching status and close date', () => {
        const round = configNamed(ROUND_TABLE);
        const label = round.indexes.find(
            (index) => columnList(index.config.columns) === 'user_id,label',
        );
        expect(label?.config.unique).toBe(true);
        expect(columnNamed(round, 'firm_id').getSQLType()).toBe('varchar(32)');
        expect(columnNamed(round, 'firm_id').notNull).toBe(false);
        expect(columnNamed(round, 'external_firm_id').notNull).toBe(false);
        expect(columnNamed(round, 'budget_cents').notNull).toBe(false);
        expect(columnNamed(round, 'opened_on').notNull).toBe(true);
        expect(columnNamed(round, 'closed_on').notNull).toBe(false);
        const expressions = checkExpressions(round);
        expect(expressions).toContain(
            'firm_id IS NULL OR external_firm_id IS NULL',
        );
        expect(expressions).toContain('budget_cents > 0');
        expect(expressions).toContain(
            'closed_on IS NULL OR closed_on >= opened_on',
        );
        expect(expressions).toContain(
            `(status = '${RoundStatus.Closed}') = (closed_on IS NOT NULL)`,
        );
    });

    it('puts an account in at most one round of the same owner, never through a single-column reference', () => {
        const account = configNamed(ACCOUNT_TABLE);
        expect(columnNamed(account, 'round_id').getSQLType()).toBe('uuid');
        expect(columnNamed(account, 'round_id').notNull).toBe(false);
        expect(foreignKeyOn(account, 'round_id,user_id').getName()).toBe(
            'prop_account_round_fk',
        );
    });

    it('keeps one engagement per firm key with exactly one firm column and a reason exactly when not Active', () => {
        const engagement = configNamed(ENGAGEMENT_TABLE);
        const expressions = checkExpressions(engagement);
        expect(expressions).toContain(
            '(firm_id IS NULL) <> (external_firm_id IS NULL)',
        );
        expect(expressions).toContain(
            `(status = '${FirmEngagementStatus.Active}') = (reason IS NULL)`,
        );
        expect(columnNamed(engagement, 'status').notNull).toBe(true);
        expect(columnNamed(engagement, 'reason').notNull).toBe(false);
        expect(columnNamed(engagement, 'reason').hasDefault).toBe(false);
        expect(columnNamed(engagement, 'since_on').notNull).toBe(true);
        expect(columnNamed(engagement, 'sent_live_on').notNull).toBe(false);
        for (const [name, columns, set] of [
            [
                'prop_firm_engagement_user_firm_idx',
                'user_id,firm_id',
                'firm_id',
            ],
            [
                'prop_firm_engagement_user_external_firm_idx',
                'user_id,external_firm_id',
                'external_firm_id',
            ],
        ] as const) {
            const index = indexNamed(engagement, name);
            expect(index.config.unique, name).toBe(true);
            expect(columnList(index.config.columns), name).toBe(columns);
            expect(sqlText(index.config.where), name).toBe(
                `${set} IS NOT NULL`,
            );
        }
    });

    it('keeps a sent-live date exactly on a SentLive reason, on or before the status date', () => {
        const expressions = checkExpressions(configNamed(ENGAGEMENT_TABLE));
        expect(expressions).toContain(
            `(reason IS NOT DISTINCT FROM '${FirmEngagementReason.SentLive}') = (sent_live_on IS NOT NULL)`,
        );
        expect(expressions).toContain(
            'sent_live_on IS NULL OR sent_live_on <= since_on',
        );
    });

    it('indexes firm engagements by owner and status date for the list, the quota count and the user cascade', () => {
        const byOwner = indexNamed(
            configNamed(ENGAGEMENT_TABLE),
            'prop_firm_engagement_user_since_idx',
        );
        expect(byOwner.config.unique).toBe(false);
        expect(byOwner.config.where).toBeUndefined();
        expect(columnList(byOwner.config.columns)).toBe('user_id,since_on');
    });

    it('keeps a firm statement for exactly one firm column with a required basis, indexed per firm by date', () => {
        const statement = configNamed(STATEMENT_TABLE);
        expect(checkExpressions(statement)).toContain(
            '(firm_id IS NULL) <> (external_firm_id IS NULL)',
        );
        expect(columnNamed(statement, 'basis').notNull).toBe(true);
        expect(columnNamed(statement, 'as_of').notNull).toBe(true);
        expect(columnNamed(statement, 'reported_payout_cents').notNull).toBe(
            true,
        );
        const indexes = indexColumnLists(statement);
        expect(indexes).toContain('user_id,firm_id,as_of');
        expect(indexes).toContain('user_id,external_firm_id,as_of');
    });

    it('keeps a violation on its account with a signed nullable cost, indexed by (user_id, account_id, occurred_on)', () => {
        const violation = configNamed(VIOLATION_TABLE);
        expect(columnNamed(violation, 'kind').notNull).toBe(true);
        expect(columnNamed(violation, 'source').notNull).toBe(true);
        expect(columnNamed(violation, 'occurred_on').notNull).toBe(true);
        expect(columnNamed(violation, 'cost_cents').getSQLType()).toBe(
            'integer',
        );
        expect(columnNamed(violation, 'cost_cents').notNull).toBe(false);
        expect(checkExpressions(violation).join(' ')).not.toMatch(
            /\bcost_cents\b/,
        );
        expect(indexColumnLists(violation)).toContain(
            'user_id,account_id,occurred_on',
        );
    });

    it('rejects in the database a violation on account A that links a decision of account B of the same owner', () => {
        const violation = configNamed(VIOLATION_TABLE);
        const decisionLink = foreignKeyOn(
            violation,
            'decision_id,account_id,user_id',
        );
        const accountLink = foreignKeyOn(violation, 'account_id,user_id');
        expect(columnList(decisionLink.reference().columns.slice(1))).toBe(
            columnList(accountLink.reference().columns),
        );
        expect(columnList(decisionLink.reference().foreignColumns)).toBe(
            'id,account_id,user_id',
        );
        expect(uniqueConstraintLists(configNamed(DECISION_TABLE))).toContain(
            'id,account_id,user_id',
        );
        expect(indexColumnLists(configNamed(DECISION_TABLE))).not.toContain(
            'id,account_id,user_id',
        );
        expect(
            violation.foreignKeys.some(
                (candidate) =>
                    columnList(candidate.reference().columns) ===
                    'decision_id,user_id',
            ),
        ).toBe(false);
    });

    it('adds a nullable payout approval date between the request and the payment', () => {
        const payout = configNamed(PAYOUT_TABLE);
        expect(columnNamed(payout, 'approved_on').notNull).toBe(false);
        const expressions = checkExpressions(payout);
        expect(expressions).toContain(
            'approved_on IS NULL OR approved_on >= requested_on',
        );
        expect(expressions).toContain(
            'paid_on IS NULL OR approved_on IS NULL OR paid_on >= approved_on',
        );
    });
});

type CheckRow = Readonly<Record<string, null | string>>;

type CheckValue = boolean | null | string;

class CheckEvaluator {
    private position = 0;
    private readonly tokens: readonly string[];

    constructor(
        expression: string,
        private readonly row: CheckRow,
    ) {
        this.tokens =
            expression.match(/'[^']*'|<>|[()=]|[A-Za-z_]+/g)?.map(String) ?? [];
    }

    private assertConsumed(): void {
        if (this.position !== this.tokens.length) {
            throw new Error(
                `unparsed check tail at ${this.tokens[this.position] ?? ''}`,
            );
        }
    }

    private comparison(): CheckValue {
        const left = this.operand();
        if (this.peekWord('IS')) {
            this.position += 1;
            const isNegated = this.peekWord('NOT');
            if (isNegated) this.position += 1;
            this.expectWord('NULL');
            return isNegated ? left !== null : left === null;
        }
        const operator = this.tokens[this.position];
        if (operator !== '=' && operator !== '<>') return left;
        this.position += 1;
        const right = this.operand();
        if (left === null || right === null) return null;
        return operator === '=' ? left === right : left !== right;
    }

    private conjunction(): CheckValue {
        let value = this.comparison();
        while (this.peekWord('AND')) {
            this.position += 1;
            value = sqlAnd(value, this.comparison());
        }
        return value;
    }

    private disjunction(): CheckValue {
        let value = this.conjunction();
        while (this.peekWord('OR')) {
            this.position += 1;
            value = sqlOr(value, this.conjunction());
        }
        return value;
    }

    private expectWord(word: string): void {
        if (!this.peekWord(word)) {
            throw new Error(
                `expected ${word} at ${this.tokens[this.position] ?? 'end'}`,
            );
        }
        this.position += 1;
    }

    private operand(): CheckValue {
        const token = this.tokens[this.position] ?? '';
        this.position += 1;
        if (token === '(') {
            const value = this.disjunction();
            this.expectWord(')');
            return value;
        }
        if (token.startsWith("'")) return token.slice(1, -1);
        if (!Object.hasOwn(this.row, token)) {
            throw new Error(`unknown column ${token}`);
        }
        return this.row[token] ?? null;
    }

    private peekWord(word: string): boolean {
        return this.tokens[this.position]?.toUpperCase() === word;
    }

    evaluate(): boolean {
        const value = this.disjunction();
        this.assertConsumed();
        return value === true;
    }
}

function isAcceptedByAccountShape(row: CheckRow): boolean {
    const expression = checkExpressions(configNamed(ACCOUNT_TABLE)).find(
        (candidate) => candidate.includes('tracking'),
    );
    if (expression === undefined) throw new Error('no tracking check');
    return new CheckEvaluator(expression, row).evaluate();
}

function sqlAnd(left: CheckValue, right: CheckValue): CheckValue {
    const values = [left, right];
    if (values.includes(false)) return false;
    return values.includes(null) ? null : values.every(Boolean);
}

function sqlOr(left: CheckValue, right: CheckValue): CheckValue {
    const values = [left, right];
    if (values.includes(true)) return true;
    return values.includes(null) ? null : values.some(Boolean);
}

const MODELED_ACCOUNT: CheckRow = {
    external_firm_id: null,
    firm_id: 'mffu',
    plan_label: null,
    plan_serial: 'mffu-rapid-50000',
    tracking: 'modeled',
};

const LEDGER_ONLY_AT_MODELED_FIRM: CheckRow = {
    external_firm_id: null,
    firm_id: 'mffu',
    plan_label: 'Rapid 150K',
    plan_serial: null,
    tracking: 'ledger-only',
};

const LEDGER_ONLY_AT_EXTERNAL_FIRM: CheckRow = {
    external_firm_id: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
    firm_id: null,
    plan_label: 'Hola Prime 100K',
    plan_serial: null,
    tracking: 'ledger-only',
};

describe('prop schema: ledger-only accounts', () => {
    it('adds a tracking column that backfills every existing account as modeled', () => {
        const tracking = columnNamed(configNamed(ACCOUNT_TABLE), 'tracking');
        expect(tracking.getSQLType()).toBe('varchar(32)');
        expect(tracking.notNull).toBe(true);
        expect(tracking.default).toBe('modeled');
    });

    it('makes the firm and plan serial nullable and adds a plan label and an external firm', () => {
        const account = configNamed(ACCOUNT_TABLE);
        expect(columnNamed(account, 'firm_id').notNull).toBe(false);
        expect(columnNamed(account, 'plan_serial').notNull).toBe(false);
        expect(columnNamed(account, 'plan_label').getSQLType()).toBe(
            'varchar(64)',
        );
        expect(columnNamed(account, 'plan_label').notNull).toBe(false);
        expect(columnNamed(account, 'external_firm_id').getSQLType()).toBe(
            'uuid',
        );
        expect(columnNamed(account, 'external_firm_id').notNull).toBe(false);
        expect(checkExpressions(account)).toContain(
            'plan_label IS NULL OR char_length(plan_label) > 0',
        );
    });

    it('accepts a modeled row and a ledger-only row at a modeled or an external firm', () => {
        expect(isAcceptedByAccountShape(MODELED_ACCOUNT)).toBe(true);
        expect(isAcceptedByAccountShape(LEDGER_ONLY_AT_MODELED_FIRM)).toBe(
            true,
        );
        expect(isAcceptedByAccountShape(LEDGER_ONLY_AT_EXTERNAL_FIRM)).toBe(
            true,
        );
    });

    it.each([
        ['a modeled row without a firm', { ...MODELED_ACCOUNT, firm_id: null }],
        [
            'a modeled row without a plan serial',
            { ...MODELED_ACCOUNT, plan_serial: null },
        ],
        [
            'a modeled row with a plan label',
            { ...MODELED_ACCOUNT, plan_label: 'Rapid 50K' },
        ],
        [
            'a modeled row with an external firm',
            {
                ...MODELED_ACCOUNT,
                external_firm_id: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
            },
        ],
        [
            'a ledger-only row with a plan serial',
            { ...LEDGER_ONLY_AT_MODELED_FIRM, plan_serial: 'mffu-rapid-50000' },
        ],
        [
            'a ledger-only row without a plan label',
            { ...LEDGER_ONLY_AT_MODELED_FIRM, plan_label: null },
        ],
        [
            'a ledger-only row with both firm columns',
            { ...LEDGER_ONLY_AT_EXTERNAL_FIRM, firm_id: 'mffu' },
        ],
        [
            'a ledger-only row with no firm column',
            { ...LEDGER_ONLY_AT_EXTERNAL_FIRM, external_firm_id: null },
        ],
        [
            'an unknown tracking value',
            { ...MODELED_ACCOUNT, tracking: 'guessed' },
        ],
    ] as const)('rejects %s in the database', (_name, row) => {
        expect(isAcceptedByAccountShape(row)).toBe(false);
    });
});

const DRIZZLE_FOLDER = path.resolve(import.meta.dirname, '../../../../drizzle');
const STATEMENT_BREAK = '--> statement-breakpoint';

interface JournalEntry {
    readonly idx: number;
    readonly tag: string;
}

function foreignKeysBeforeTheirTargets(
    statements: readonly string[],
): string[] {
    const targets = new Set<string>();
    const early: string[] = [];
    for (const statement of statements) {
        const created = /^CREATE TABLE "(\w+)"/.exec(statement);
        if (created?.[1]) {
            const table = created[1];
            for (const match of statement.matchAll(
                /"(\w+)" uuid PRIMARY KEY|"(\w+)" text PRIMARY KEY|"(\w+)" serial PRIMARY KEY/g,
            )) {
                targets.add(
                    keyOf(table, match[1] ?? match[2] ?? match[3] ?? ''),
                );
            }
            for (const match of statement.matchAll(/UNIQUE\(([^)]*)\)/g)) {
                targets.add(keyOf(table, match[1] ?? ''));
            }
            continue;
        }
        const altered =
            /^ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" UNIQUE\(([^)]*)\)/.exec(
                statement,
            );
        if (altered?.[1]) {
            targets.add(keyOf(altered[1], altered[2] ?? ''));
            continue;
        }
        const reference =
            /FOREIGN KEY \(([^)]*)\) REFERENCES "public"\."(\w+)"\(([^)]*)\)/.exec(
                statement,
            );
        if (!reference?.[2] || !reference[3]) continue;
        const target = keyOf(reference[2], reference[3]);
        if (target.startsWith('sadranl_prop_') && !targets.has(target)) {
            early.push(target);
        }
    }
    return early;
}

function journalStatements(): string[] {
    const journal = JSON.parse(
        readFileSync(
            path.join(DRIZZLE_FOLDER, 'meta', '_journal.json'),
            'utf8',
        ),
    ) as { readonly entries: readonly JournalEntry[] };
    return journal.entries
        .toSorted((a, b) => a.idx - b.idx)
        .flatMap((entry) =>
            readFileSync(path.join(DRIZZLE_FOLDER, `${entry.tag}.sql`), 'utf8')
                .split(STATEMENT_BREAK)
                .map((statement) => statement.trim()),
        );
}

function keyOf(table: string, columns: string): string {
    return `${table}(${columns.replaceAll(/[\s"]/g, '')})`;
}

describe('prop migrations', () => {
    it('flags a composite foreign key whose unique target is added later in the same migration', () => {
        expect(
            foreignKeysBeforeTheirTargets([
                'CREATE TABLE "sadranl_prop_a" (\n"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n"account_id" uuid NOT NULL\n);',
                'ALTER TABLE "sadranl_prop_b" ADD CONSTRAINT "b_a_fk" FOREIGN KEY ("a_id","account_id") REFERENCES "public"."sadranl_prop_a"("id","account_id") ON DELETE no action ON UPDATE no action;',
                'ALTER TABLE "sadranl_prop_a" ADD CONSTRAINT "a_uq" UNIQUE("id","account_id");',
            ]),
        ).toEqual(['sadranl_prop_a(id,account_id)']);
        expect(
            foreignKeysBeforeTheirTargets([
                'CREATE TABLE "sadranl_prop_a" (\n"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,\n"account_id" uuid NOT NULL\n);',
                'ALTER TABLE "sadranl_prop_a" ADD CONSTRAINT "a_uq" UNIQUE("id","account_id");',
                'ALTER TABLE "sadranl_prop_b" ADD CONSTRAINT "b_a_fk" FOREIGN KEY ("a_id","account_id") REFERENCES "public"."sadranl_prop_a"("id","account_id") ON DELETE no action ON UPDATE no action;',
            ]),
        ).toEqual([]);
    });

    it('creates every prop foreign key target before the foreign key, in journal order', () => {
        const statements = journalStatements();
        expect(
            statements.some((statement) =>
                statement.includes('"prop_rule_violation_decision_fk"'),
            ),
        ).toBe(true);
        expect(foreignKeysBeforeTheirTargets(statements)).toEqual([]);
    });
});
