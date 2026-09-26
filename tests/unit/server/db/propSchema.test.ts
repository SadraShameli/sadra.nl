import { is } from 'drizzle-orm';
import {
    type ForeignKey,
    getTableConfig,
    type IndexedColumn,
    type PgColumn,
    PgDialect,
    PgTable,
} from 'drizzle-orm/pg-core';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    MAX_ACCOUNT_DATE_YEAR,
    MAX_PLAN_SERIAL_LENGTH,
    MIN_ACCOUNT_DATE_YEAR,
    PayoutStatus,
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
];
const ENUM_COLUMNS = new Set([
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

describe('prop schema', () => {
    it('defines exactly the 9 prop tables', () => {
        expect(CONFIGS.map((config) => config.name).toSorted(byName)).toEqual(
            [
                'sadranl_prop_account',
                'sadranl_prop_account_event',
                'sadranl_prop_account_snapshot',
                'sadranl_prop_copy_group',
                'sadranl_prop_fee',
                'sadranl_prop_payout',
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
        for (const name of [ACCOUNT_TABLE, 'sadranl_prop_copy_group']) {
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
        const cases: [TableConfig, string, string, string, string][] = [
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
            'propCopyGroup',
            'propFee',
            'propPayout',
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
            ['sadranl_prop_sizing_decision', 'snapshot_id,account_id,user_id'],
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

    it('gives no enum column a DB default', () => {
        let enumColumns = 0;
        for (const config of CONFIGS) {
            for (const column of config.columns) {
                if (!ENUM_COLUMNS.has(column.name)) continue;
                enumColumns += 1;
                expect(column.hasDefault, `${config.name}.${column.name}`).toBe(
                    false,
                );
                expect(column.notNull, `${config.name}.${column.name}`).toBe(
                    true,
                );
            }
        }
        expect(enumColumns).toBeGreaterThanOrEqual(9);
    });

    it('gives no varchar column a DB default', () => {
        for (const config of CONFIGS) {
            for (const column of config.columns) {
                if (!column.getSQLType().startsWith('varchar')) continue;
                expect(column.hasDefault, `${config.name}.${column.name}`).toBe(
                    false,
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
        expect(dateColumns.length).toBeGreaterThanOrEqual(10);
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
        expect(dateColumns).toBe(11);
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
        expect(dateChecks).toHaveLength(11);
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
