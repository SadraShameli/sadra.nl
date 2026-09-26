import { describe, expect, it } from 'vitest';

import {
    AccountStage,
    AccountTracking,
    DashboardBalanceConvention,
    isLedgerOnlySnapshotField,
    LEDGER_ONLY_SNAPSHOT_FIELD_LIST,
    SnapshotField,
    SnapshotSource,
    usdCents,
} from '~/lib/prop-accounts';
import {
    csvCommitPayload,
    CsvFailureKind,
    CsvIssueKind,
    csvIssues,
    CsvTableKind,
    previewSnapshotCsv,
    REQUIRED_SNAPSHOT_CSV_COLUMNS,
    SNAPSHOT_CSV_COLUMNS,
    type SnapshotCsvAccount,
    SnapshotCsvColumn,
    type SnapshotCsvStored,
    snapshotCsvWarnings,
} from '~/lib/prop-accounts/csv';
import {
    ALL_FIRMS,
    DrawdownKind,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    LiveApplicabilityKind,
    livePlanApplicability,
} from '~/lib/prop-calculator/advisor';

const ALPHA_ID = '11111111-1111-4111-8111-111111111111';
const BRAVO_ID = '22222222-2222-4222-8222-222222222222';
const OLD_ID = '33333333-3333-4333-8333-333333333333';
const ZERO_ID = '44444444-4444-4444-8444-444444444444';
const GONE_ID = '55555555-5555-4555-8555-555555555555';
const LIVE_ID = '66666666-6666-4666-8666-666666666666';
const LEDGER_ONLY_ID = '77777777-7777-4777-8777-777777777777';
const LEDGER_ONLY_FIELD_MESSAGE = `a ledger-only account takes only ${LEDGER_ONLY_SNAPSHOT_FIELD_LIST}; this field feeds plan rules it does not have`;

const FIFTY_K_PLAN = findPlan(
    (plan) =>
        plan.accountSize === 50_000 &&
        !plan.isInstantFunded &&
        plan.drawdownFor(TradingPhase.Eval).kind === DrawdownKind.EodTrailing,
);

function accountOf(
    id: string,
    label: string,
    overrides: Partial<SnapshotCsvAccount> = {},
): SnapshotCsvAccount {
    return {
        accountSize: FIFTY_K_PLAN.id.accountSize,
        archivedAt: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FIFTY_K_PLAN.id.firm,
        fundedOn: null,
        id,
        label,
        liveStartBalanceCents: null,
        optIns: NO_PLAN_OPT_INS,
        planLabel: null,
        planSerial: serializePlanId(FIFTY_K_PLAN.id),
        purchasedOn: '2026-01-01',
        readIssues: [],
        stage: AccountStage.Eval,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

function findPlan(isMatch: (plan: Plan) => boolean): Plan {
    const found = ALL_FIRMS.flatMap((firm) => firm.plans).find(isMatch);
    if (found === undefined) throw new Error('no plan matches the predicate');
    return found;
}

const ACCOUNTS: readonly SnapshotCsvAccount[] = [
    accountOf(ALPHA_ID, 'Alpha', {
        fundedOn: '2026-09-01',
        stage: AccountStage.Funded,
    }),
    accountOf(BRAVO_ID, 'Bravo'),
    accountOf(OLD_ID, 'Retired', { archivedAt: new Date('2026-01-01') }),
    accountOf(ZERO_ID, 'Zero', {
        dashboardConvention: DashboardBalanceConvention.ZeroBased,
    }),
    accountOf(GONE_ID, 'Gone', { firmId: 'gone-firm' }),
];

const NO_STORED_SNAPSHOTS: readonly SnapshotCsvStored[] = [];

describe('previewSnapshotCsv', () => {
    it('resolves the account label and reads every money column as exact cents', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance,highestEodBalance,highestIntradayBalance,dashboardFloor,payoutsTaken,tradingDays,qualifyingDaysSinceLastPayout,balanceAtLastPayout,floorAtLastPayout,lastPayoutOn,cycleBestDayProfit,evalBestDayProfit,cumulativePayout,lastTradedOn',
                'Alpha,2026-09-25,52340.12,52500,52610.5,50100,2,14,3,51800,50100,2026-09-15,420.25,0,1350.75,2026-09-25',
            ].join('\r\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([]);
        expect(csvCommitPayload(preview)).toEqual([
            {
                accountId: ALPHA_ID,
                asOf: '2026-09-25',
                balanceAtLastPayoutCents: 5_180_000,
                balanceCents: 5_234_012,
                cumulativePayoutCents: 135_075,
                cycleBestDayProfitCents: 42_025,
                dashboardFloorCents: 5_010_000,
                evalBestDayProfitCents: 0,
                floorAtLastPayoutCents: 5_010_000,
                highestEodBalanceCents: 5_250_000,
                highestIntradayBalanceCents: 5_261_050,
                lastPayoutOn: '2026-09-15',
                lastTradedOn: '2026-09-25',
                payoutsTaken: 2,
                qualifyingDaysSinceLastPayout: 3,
                source: SnapshotSource.Import,
                tradingDays: 14,
            },
        ]);
    });

    it('reads a quoted money cell with a dollar sign and thousands separators as the account form does', () => {
        const preview = previewSnapshotCsv(
            'account,asOf,balance\nAlpha,2026-09-25,"$50,400"',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([]);
        expect(csvCommitPayload(preview)).toEqual([
            expect.objectContaining({ balanceCents: 5_040_000 }),
        ]);
    });

    it('leaves optional columns null when absent or empty', () => {
        const preview = previewSnapshotCsv(
            'account,asOf,balance,tradingDays\nBravo,2026-09-25,49000,',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvCommitPayload(preview)).toEqual([
            expect.objectContaining({
                accountId: BRAVO_ID,
                balanceCents: 4_900_000,
                highestEodBalanceCents: null,
                payoutsTaken: null,
                tradingDays: null,
            }),
        ]);
    });

    it('flags an unknown label and a label that only matches an archived account', () => {
        const preview = previewSnapshotCsv(
            'account,asOf,balance\nGhost,2026-09-25,1\nRetired,2026-09-25,1\nalpha,2026-09-25,1',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([
            {
                column: SnapshotCsvColumn.Account,
                kind: CsvIssueKind.Cell,
                message: 'no active account is labeled "Ghost"',
                rowNumber: 2,
            },
            {
                column: SnapshotCsvColumn.Account,
                kind: CsvIssueKind.Cell,
                message: 'no active account is labeled "Retired"',
                rowNumber: 3,
            },
            {
                column: SnapshotCsvColumn.Account,
                kind: CsvIssueKind.Cell,
                message: 'no active account is labeled "alpha"',
                rowNumber: 4,
            },
        ]);
    });

    it('reports schema errors per row with the row number and the column', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance,payoutsTaken,cumulativePayout,tradingDays',
                'Alpha,2026-09-25,50000,1001,,1',
                'Bravo,2026-09-25,50000,1,-5,1',
                'Alpha,1999-12-31,50000,1,,1',
            ].join('\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(
            csvIssues(preview).map((issue) => [
                issue.rowNumber,
                issue.column,
                issue.kind,
            ]),
        ).toEqual([
            [2, SnapshotCsvColumn.PayoutsTaken, CsvIssueKind.Schema],
            [3, SnapshotCsvColumn.CumulativePayout, CsvIssueKind.Schema],
            [4, SnapshotCsvColumn.AsOf, CsvIssueKind.Cell],
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('rejects two rows for one account and date as a batch issue on the later row', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance',
                'Alpha,2026-09-25,50000',
                'Bravo,2026-09-25,50000',
                'Alpha,2026-09-24,50000',
                'Alpha,2026-09-25,50100',
            ].join('\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([
            {
                column: SnapshotCsvColumn.AsOf,
                kind: CsvIssueKind.Batch,
                message:
                    'one batch holds only one snapshot per account and date',
                rowNumber: 5,
            },
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('rejects a row whose account and date already have a stored snapshot as a batch issue', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance',
                'Alpha,2026-09-25,50000',
                'Alpha,2026-09-24,50000',
                'Bravo,2026-09-25,50000',
            ].join('\n'),
            ACCOUNTS,
            [
                { accountId: ALPHA_ID, asOf: '2026-09-25' },
                { accountId: OLD_ID, asOf: '2026-09-25' },
            ],
        );

        expect(csvIssues(preview)).toEqual([
            {
                column: SnapshotCsvColumn.AsOf,
                kind: CsvIssueKind.Batch,
                message:
                    'a snapshot for this account and date is already stored; remove it first or use another date',
                rowNumber: 2,
            },
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('needs the account, date and balance columns and fails over 200 rows', () => {
        expect(REQUIRED_SNAPSHOT_CSV_COLUMNS).toEqual([
            SnapshotCsvColumn.Account,
            SnapshotCsvColumn.AsOf,
            SnapshotCsvColumn.Balance,
        ]);
        expect(
            previewSnapshotCsv(
                'account,balance\nAlpha,1',
                ACCOUNTS,
                NO_STORED_SNAPSHOTS,
            ),
        ).toEqual({
            failure: {
                columns: [SnapshotCsvColumn.AsOf],
                kind: CsvFailureKind.MissingColumns,
            },
            kind: CsvTableKind.Failed,
        });
        const rows = Array.from(
            { length: 201 },
            (_, index) =>
                `Alpha,2026-0${1 + Math.floor(index / 28)}-${String(1 + (index % 28)).padStart(2, '0')},50000`,
        );
        expect(
            previewSnapshotCsv(
                ['account,asOf,balance', ...rows].join('\n'),
                ACCOUNTS,
                NO_STORED_SNAPSHOTS,
            ),
        ).toEqual({
            failure: {
                actual: 201,
                kind: CsvFailureKind.TooManyRows,
                limit: 200,
            },
            kind: CsvTableKind.Failed,
        });
        const atLimit = ['account,asOf,balance', ...rows.slice(0, 200)].join(
            '\n',
        );
        expect(
            csvCommitPayload(
                previewSnapshotCsv(atLimit, ACCOUNTS, NO_STORED_SNAPSHOTS),
            ),
        ).toHaveLength(200);
    });

    it('flags a nominal 2,400 on a 50K account on the balance column with its row number and blocks the import', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance,highestEodBalance,tradingDays',
                'Bravo,2026-09-24,50400,50600,3',
                'Bravo,2026-09-25,2400,2400,3',
            ].join('\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        const issues = csvIssues(preview);
        expect(
            issues.map((issue) => [issue.rowNumber, issue.column, issue.kind]),
        ).toEqual([
            [3, SnapshotCsvColumn.Balance, CsvIssueKind.Plausibility],
            [3, SnapshotCsvColumn.HighestEodBalance, CsvIssueKind.Plausibility],
        ]);
        expect(issues[0]?.message).toContain(
            'set the dashboard convention to $0-based',
        );
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('flags a $0-based 52,400 on a 50K account on the balance column and accepts the row once fixed', () => {
        const wrong = previewSnapshotCsv(
            'account,asOf,balance,highestEodBalance,tradingDays\nZero,2026-09-25,52400,52400,3',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );
        const [balanceIssue] = csvIssues(wrong);
        expect(balanceIssue).toMatchObject({
            column: SnapshotCsvColumn.Balance,
            kind: CsvIssueKind.Plausibility,
            rowNumber: 2,
        });
        expect(balanceIssue?.message).toContain(
            'set the dashboard convention to nominal',
        );
        expect(csvCommitPayload(wrong)).toBeNull();

        const fixed = previewSnapshotCsv(
            'account,asOf,balance,highestEodBalance,tradingDays\nZero,2026-09-25,2400,2400,3',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );
        expect(csvIssues(fixed)).toEqual([]);
        expect(csvCommitPayload(fixed)).toEqual([
            expect.objectContaining({
                accountId: ZERO_ID,
                balanceCents: 240_000,
            }),
        ]);
    });

    it('only warns about a balance far above the account size, checked against the stage on its date, and keeps the rows importable', () => {
        const evalCeiling =
            FIFTY_K_PLAN.id.accountSize +
            FIFTY_K_PLAN.profitTarget +
            FIFTY_K_PLAN.drawdownFor(TradingPhase.Eval).amount;
        const balance = evalCeiling + 5000;
        expect(balance).toBeLessThan(2 * FIFTY_K_PLAN.id.accountSize);
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance,highestEodBalance',
                `Alpha,2026-08-20,${balance},${balance}`,
                `Alpha,2026-09-25,${balance},${balance}`,
            ].join('\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([]);
        expect(csvCommitPayload(preview)).toHaveLength(2);
        const warnings = snapshotCsvWarnings(preview, ACCOUNTS);
        expect(
            warnings.map((warning) => [
                warning.rowNumber,
                warning.column,
                warning.kind,
            ]),
        ).toEqual([
            [2, SnapshotCsvColumn.Balance, CsvIssueKind.Plausibility],
            [2, SnapshotCsvColumn.HighestEodBalance, CsvIssueKind.Plausibility],
        ]);
        expect(warnings[0]?.message).toContain(
            `above the $${FIFTY_K_PLAN.id.accountSize.toLocaleString('en-US')} account size`,
        );
    });

    it('gives no warning for a row that is already blocked or plausible', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance,highestEodBalance,tradingDays',
                'Bravo,2026-09-24,50400,50600,3',
                'Bravo,2026-09-25,2400,2400,3',
            ].join('\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(snapshotCsvWarnings(preview, ACCOUNTS)).toEqual([]);
    });

    it('blocks a live row while the live start balance of the account is outside the documented range, and says to edit the account', () => {
        const livePlan = findPlan((plan) => {
            const applicability = livePlanApplicability(plan.id);
            return (
                !plan.isInstantFunded &&
                applicability.kind === LiveApplicabilityKind.Builder &&
                applicability.documentedStart?.(plan.accountSize) !== undefined
            );
        });
        const applicability = livePlanApplicability(livePlan.id);
        if (applicability.kind !== LiveApplicabilityKind.Builder) {
            throw new Error('expected a live builder');
        }
        const range = applicability.documentedStart?.(livePlan.accountSize);
        if (range === undefined) {
            throw new Error('expected a documented live start');
        }
        const live = accountOf(LIVE_ID, 'Live', {
            accountSize: livePlan.id.accountSize,
            firmId: livePlan.id.firm,
            fundedOn: '2026-09-01',
            liveStartBalanceCents: usdCents(
                Math.round((range.highest + 10_000) * 100),
            ),
            planSerial: serializePlanId(livePlan.id),
            stage: AccountStage.Live,
        });
        const preview = previewSnapshotCsv(
            'account,asOf,balance,payoutsTaken\nLive,2026-09-25,10000,0',
            [live],
            NO_STORED_SNAPSHOTS,
        );

        const [issue] = csvIssues(preview);
        expect(issue).toMatchObject({
            column: SnapshotCsvColumn.Account,
            kind: CsvIssueKind.Plausibility,
            rowNumber: 2,
        });
        expect(issue?.message).toContain('edit the account to fix it');
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('flags a highest end-of-day balance below the balance on its own column', () => {
        const preview = previewSnapshotCsv(
            'account,asOf,balance,highestEodBalance\nBravo,2026-09-25,50800,50500',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(
            csvIssues(preview).map((issue) => [issue.column, issue.kind]),
        ).toEqual([
            [SnapshotCsvColumn.HighestEodBalance, CsvIssueKind.Plausibility],
        ]);
    });

    it('reports an account whose plan cannot be resolved as a cell issue instead of failing', () => {
        const preview = previewSnapshotCsv(
            'account,asOf,balance\nGone,2026-09-25,50000',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([
            {
                column: SnapshotCsvColumn.Account,
                kind: CsvIssueKind.Cell,
                message:
                    'the plan cannot be resolved, so the balances cannot be checked: Unknown prop firm "gone-firm"',
                rowNumber: 2,
            },
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('takes a balance and a floor for a ledger-only account without plan checks, even one far above any modeled size', () => {
        const ledgerOnly = accountOf(LEDGER_ONLY_ID, 'Ledger', {
            accountSize: 150_000,
            planLabel: 'Rapid 150K',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const preview = previewSnapshotCsv(
            'account,asOf,balance,dashboardFloor\nLedger,2026-09-25,2400,145500',
            [ledgerOnly],
            NO_STORED_SNAPSHOTS,
        );
        expect(csvIssues(preview)).toEqual([]);
        expect(snapshotCsvWarnings(preview, [ledgerOnly])).toEqual([]);
        expect(csvCommitPayload(preview)?.[0]).toMatchObject({
            accountId: LEDGER_ONLY_ID,
            balanceCents: 240_000,
            dashboardFloorCents: 14_550_000,
        });
    });

    it('takes the payout totals for a ledger-only account, which the payout mismatch rules read without a plan', () => {
        const ledgerOnly = accountOf(LEDGER_ONLY_ID, 'Ledger', {
            accountSize: 150_000,
            planLabel: 'Rapid 150K',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const preview = previewSnapshotCsv(
            'account,asOf,balance,payoutsTaken,cumulativePayout\nLedger,2026-09-25,151000,3,9000',
            [ledgerOnly],
            NO_STORED_SNAPSHOTS,
        );
        expect(csvIssues(preview)).toEqual([]);
        expect(csvCommitPayload(preview)?.[0]).toMatchObject({
            accountId: LEDGER_ONLY_ID,
            cumulativePayoutCents: 900_000,
            payoutsTaken: 3,
        });
    });

    it.each(
        SNAPSHOT_CSV_COLUMNS.filter(
            (column) =>
                !REQUIRED_SNAPSHOT_CSV_COLUMNS.includes(column) &&
                column !== SnapshotCsvColumn.LastPayoutOn &&
                column !== SnapshotCsvColumn.LastTradedOn,
        ),
    )(
        'takes the %s column on a ledger-only row exactly when the shared ledger-only field set holds it',
        (column) => {
            const ledgerOnly = accountOf(LEDGER_ONLY_ID, 'Ledger', {
                externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
                firmId: null,
                planLabel: 'Hola Prime 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            });
            const preview = previewSnapshotCsv(
                `account,asOf,balance,${column}\nLedger,2026-09-25,101000,1`,
                [ledgerOnly],
                NO_STORED_SNAPSHOTS,
            );
            const fieldKeys: readonly string[] = Object.values(SnapshotField);
            const candidates: readonly string[] = [column, `${column}Cents`];
            const field = candidates.find((key) => fieldKeys.includes(key));
            expect(field).toBeDefined();
            expect(csvIssues(preview).map((issue) => issue.column)).toEqual(
                isLedgerOnlySnapshotField(field ?? '') ? [] : [column],
            );
        },
    );

    it('blocks plan-rule fields on a ledger-only account row, each on its own column', () => {
        const ledgerOnly = accountOf(LEDGER_ONLY_ID, 'Ledger', {
            externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const preview = previewSnapshotCsv(
            'account,asOf,balance,highestEodBalance,tradingDays\nLedger,2026-09-25,101000,101500,4',
            [ledgerOnly],
            NO_STORED_SNAPSHOTS,
        );
        expect(
            csvIssues(preview).map((issue) => [
                issue.column,
                issue.kind,
                issue.message,
            ]),
        ).toEqual([
            [
                SnapshotCsvColumn.HighestEodBalance,
                CsvIssueKind.Plausibility,
                LEDGER_ONLY_FIELD_MESSAGE,
            ],
            [
                SnapshotCsvColumn.TradingDays,
                CsvIssueKind.Plausibility,
                LEDGER_ONLY_FIELD_MESSAGE,
            ],
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });
});
