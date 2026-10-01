import { describe, expect, it } from 'vitest';

import {
    AccountStage,
    AccountTracking,
    DashboardBalanceConvention,
    describeLifecycleRejection,
    LifecycleRejection,
    liveStartEntryIssues,
    usdCents,
} from '~/lib/prop-accounts';
import {
    AccountCsvColumn,
    type AccountCsvPreview,
    csvCommitPayload,
    CsvFailureKind,
    type CsvIssue,
    CsvIssueKind,
    csvIssues,
    CsvTableKind,
    previewAccountCsv,
    REQUIRED_ACCOUNT_CSV_COLUMNS,
} from '~/lib/prop-accounts/csv';
import {
    ALL_FIRMS,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

import { documentedLiveStartEntry } from '../liveStartFixtures';

interface RegistryEntry {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

const REGISTRY: readonly RegistryEntry[] = ALL_FIRMS.flatMap((firm) =>
    firm.plans.map((plan) => ({ firm, plan })),
);

const HEADER =
    'label,firm,plan,accountSize,stage,purchasedOn,fundedOn,fundedReset,dashboardConvention,tags,maxRiskPerTrade,liveStartBalance,notes,round';

const LEDGER_HEADER = 'label,firm,plan,accountSize,stage,purchasedOn,tracking';

const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';
const OTHER_EXTERNAL_FIRM_ID = '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6';
const ROUND_ID = 'e5555555-5555-4555-8555-555555555555';

function csv(...rows: string[]): string {
    return [HEADER, ...rows].join('\r\n');
}

function firstEntry(isMatch: (entry: RegistryEntry) => boolean): RegistryEntry {
    const entry = REGISTRY.find(isMatch);
    if (entry === undefined) throw new Error('no registry plan matches');
    return entry;
}

const EVAL_PLAN = firstEntry(
    ({ plan }) => !plan.isInstantFunded && plan.fundedReset === null,
);
const RESET_PLAN = firstEntry(
    ({ plan }) => !plan.isInstantFunded && plan.fundedReset !== null,
);
const INSTANT_PLAN = firstEntry(({ plan }) => plan.isInstantFunded);

function issuesOf(preview: AccountCsvPreview): readonly CsvIssue[] {
    return csvIssues(preview);
}

function row(
    entry: RegistryEntry,
    overrides: Partial<Record<AccountCsvColumn, string>> = {},
): string {
    const cells: Record<string, string> = {
        [AccountCsvColumn.AccountSize]: String(entry.plan.id.accountSize),
        [AccountCsvColumn.DashboardConvention]: '',
        [AccountCsvColumn.Firm]: entry.firm.id,
        [AccountCsvColumn.FundedOn]: '',
        [AccountCsvColumn.FundedReset]: '',
        [AccountCsvColumn.Label]: 'Account one',
        [AccountCsvColumn.LiveStartBalance]: '',
        [AccountCsvColumn.MaxRiskPerTrade]: '',
        [AccountCsvColumn.Notes]: '',
        [AccountCsvColumn.Plan]: serializePlanId(entry.plan.id),
        [AccountCsvColumn.PurchasedOn]: '2026-09-01',
        [AccountCsvColumn.Stage]: AccountStage.Eval,
        [AccountCsvColumn.Tags]: '',
        ...overrides,
    };
    return HEADER.split(',')
        .map((column) => {
            const cell = cells[column] ?? '';
            return /[",\n]/.test(cell)
                ? `"${cell.replaceAll('"', '""')}"`
                : cell;
        })
        .join(',');
}

describe('previewAccountCsv', () => {
    it('turns a clean row into the exact account create input, money in cents', () => {
        const preview = previewAccountCsv(
            csv(
                row(RESET_PLAN, {
                    [AccountCsvColumn.FundedOn]: '2026-09-10',
                    [AccountCsvColumn.FundedReset]: 'yes',
                    [AccountCsvColumn.Label]: '  Reset account ',
                    [AccountCsvColumn.LiveStartBalance]: '1234.56',
                    [AccountCsvColumn.MaxRiskPerTrade]: '250',
                    [AccountCsvColumn.Notes]: 'line one\nline two',
                    [AccountCsvColumn.Stage]: 'FUNDED',
                    [AccountCsvColumn.Tags]: 'copy, apex',
                }),
            ),
            [],
        );

        expect(issuesOf(preview)).toEqual([]);
        expect(csvCommitPayload(preview)).toEqual([
            {
                accountSize: RESET_PLAN.plan.id.accountSize,
                copyGroupId: null,
                dashboardConvention: DashboardBalanceConvention.Nominal,
                externalAlias: null,
                firmId: RESET_PLAN.firm.id,
                firstFundedTradeOn: null,
                fundedOn: '2026-09-10',
                label: 'Reset account',
                liveStartBalanceCents: 123_456,
                notes: 'line one\nline two',
                optIns: {
                    takesFundedReset: true,
                    takesOneTimeEarlyWithdrawal: false,
                },
                overrideRoundBudget: false,
                personalRules: { maxRiskPerTradeCents: 25_000 },
                planSerial: serializePlanId(RESET_PLAN.plan.id),
                purchasedOn: '2026-09-01',
                replacesAccountId: null,
                roundId: null,
                stage: AccountStage.Funded,
                tags: ['copy', 'apex'],
                tracking: AccountTracking.Modeled,
            },
        ]);
    });

    it('imports a ledger-only row: the plan column holds its plan label and any positive whole-dollar size is accepted', () => {
        const preview = previewAccountCsv(
            [
                LEDGER_HEADER,
                'Rapid 150K,MFFU,Rapid 150K,150000,funded,2026-09-01,ledger-only',
            ].join('\r\n'),
            [],
        );
        expect(issuesOf(preview)).toEqual([]);
        expect(csvCommitPayload(preview)).toEqual([
            {
                accountSize: 150_000,
                copyGroupId: null,
                dashboardConvention: DashboardBalanceConvention.Nominal,
                externalAlias: null,
                externalFirmId: null,
                firmId: FirmId.Mffu,
                firstFundedTradeOn: null,
                fundedOn: null,
                label: 'Rapid 150K',
                liveStartBalanceCents: null,
                notes: null,
                optIns: NO_PLAN_OPT_INS,
                overrideRoundBudget: false,
                personalRules: {},
                planLabel: 'Rapid 150K',
                purchasedOn: '2026-09-01',
                replacesAccountId: null,
                roundId: null,
                stage: AccountStage.Funded,
                tags: [],
                tracking: AccountTracking.LedgerOnly,
            },
        ]);
    });

    it('resolves a ledger-only firm name to one of the caller own firms, ignoring letter case', () => {
        const preview = previewAccountCsv(
            [
                LEDGER_HEADER,
                'Hola one,hola prime,100K Flex,100000,funded,2026-09-01,ledger-only',
            ].join('\r\n'),
            [],
            [
                { id: EXTERNAL_FIRM_ID, name: 'Hola Prime' },
                { id: OTHER_EXTERNAL_FIRM_ID, name: 'Funded Seat' },
            ],
        );
        expect(issuesOf(preview)).toEqual([]);
        expect(csvCommitPayload(preview)?.[0]).toMatchObject({
            externalFirmId: EXTERNAL_FIRM_ID,
            firmId: null,
            planLabel: '100K Flex',
            tracking: AccountTracking.LedgerOnly,
        });
    });

    it('flags a ledger-only firm that is neither listed nor one of the caller own firms, and an opt-in on a ledger-only row', () => {
        const preview = previewAccountCsv(
            [
                `${LEDGER_HEADER},fundedReset`,
                'Unknown,Nowhere Futures,100K,100000,funded,2026-09-01,ledger-only,',
                'Opted,apex,100K,100000,funded,2026-09-01,ledger-only,yes',
            ].join('\r\n'),
            [],
            [{ id: EXTERNAL_FIRM_ID, name: 'Hola Prime' }],
        );
        expect(
            issuesOf(preview).map((issue) => [
                issue.rowNumber,
                issue.column,
                issue.message,
            ]),
        ).toEqual([
            [
                2,
                AccountCsvColumn.Firm,
                'no listed firm and none of your own firms is named "Nowhere Futures"; add the firm first',
            ],
            [
                3,
                AccountCsvColumn.FundedReset,
                'opt-ins apply to modeled plans only; leave it empty on a ledger-only row',
            ],
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('resolves a round label to the caller own round, scoped to the rounds passed in', () => {
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, { [AccountCsvColumn.Round]: 'September round' }),
            ),
            [],
            [],
            [{ id: ROUND_ID, label: 'September round' }],
        );
        expect(issuesOf(preview)).toEqual([]);
        expect(csvCommitPayload(preview)?.[0]).toMatchObject({
            roundId: ROUND_ID,
        });
    });

    it('leaves roundId null when the round column is empty', () => {
        const preview = previewAccountCsv(csv(row(EVAL_PLAN)), []);
        expect(issuesOf(preview)).toEqual([]);
        expect(csvCommitPayload(preview)?.[0]).toMatchObject({ roundId: null });
    });

    it('flags a round label that is none of the caller own rounds', () => {
        const preview = previewAccountCsv(
            csv(row(EVAL_PLAN, { [AccountCsvColumn.Round]: 'Nonexistent' })),
            [],
            [],
            [{ id: ROUND_ID, label: 'September round' }],
        );
        expect(
            issuesOf(preview).map((issue) => [issue.column, issue.message]),
        ).toEqual([
            [
                AccountCsvColumn.Round,
                'none of your rounds is named "Nonexistent"; add the round first',
            ],
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('flags a round label matching more than one of the caller own rounds case-insensitively', () => {
        const OTHER_ROUND_ID = 'e6666666-6666-4666-8666-666666666666';
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, { [AccountCsvColumn.Round]: 'September round' }),
            ),
            [],
            [],
            [
                { id: ROUND_ID, label: 'September round' },
                { id: OTHER_ROUND_ID, label: 'september round' },
            ],
        );
        expect(
            issuesOf(preview).map((issue) => [issue.column, issue.message]),
        ).toEqual([
            [
                AccountCsvColumn.Round,
                'more than one of your rounds is named "September round" (case-insensitively); rename one of them before importing',
            ],
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('reports schema errors per row with the spreadsheet row number and the column', () => {
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, { [AccountCsvColumn.Label]: 'good' }),
                row(EVAL_PLAN, {
                    [AccountCsvColumn.Label]: 'bad date',
                    [AccountCsvColumn.PurchasedOn]: '2026-02-30',
                }),
                row(EVAL_PLAN, {
                    [AccountCsvColumn.Label]: 'bad plan',
                    [AccountCsvColumn.Plan]: 'no-such-plan',
                }),
                row(EVAL_PLAN, {
                    [AccountCsvColumn.FundedOn]: '2026-08-01',
                    [AccountCsvColumn.Label]: 'funded before purchase',
                }),
            ),
            [],
        );

        expect(
            issuesOf(preview).map((issue) => [
                issue.rowNumber,
                issue.column,
                issue.kind,
            ]),
        ).toEqual([
            [3, AccountCsvColumn.PurchasedOn, CsvIssueKind.Cell],
            [4, AccountCsvColumn.Plan, CsvIssueKind.Schema],
            [5, AccountCsvColumn.FundedOn, CsvIssueKind.Schema],
        ]);
        expect(issuesOf(preview)[2]?.message).toBe(
            'an account cannot be funded before it was purchased',
        );
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('rejects an opt-in the plan does not offer on that opt-in column, and accepts an offered one', () => {
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, {
                    [AccountCsvColumn.FundedReset]: 'yes',
                    [AccountCsvColumn.Label]: 'not offered',
                }),
                row(RESET_PLAN, {
                    [AccountCsvColumn.FundedReset]: 'true',
                    [AccountCsvColumn.Label]: 'offered',
                }),
            ),
            [],
        );

        expect(issuesOf(preview)).toEqual([
            {
                column: AccountCsvColumn.FundedReset,
                kind: CsvIssueKind.Schema,
                message: `Plan "${serializePlanId(EVAL_PLAN.plan.id)}" does not offer every selected opt-in: funded reset`,
                rowNumber: 2,
            },
        ]);
    });

    it('rejects the eval stage on an instant-funded plan and accepts funded', () => {
        const preview = previewAccountCsv(
            csv(
                row(INSTANT_PLAN, { [AccountCsvColumn.Label]: 'instant eval' }),
                row(INSTANT_PLAN, {
                    [AccountCsvColumn.Label]: 'instant funded',
                    [AccountCsvColumn.Stage]: AccountStage.Funded,
                }),
            ),
            [],
        );

        expect(issuesOf(preview)).toEqual([
            {
                column: AccountCsvColumn.Stage,
                kind: CsvIssueKind.Schema,
                message: describeLifecycleRejection(
                    LifecycleRejection.EvalOnInstantFundedPlan,
                    { facts: INSTANT_PLAN.plan, stage: AccountStage.Eval },
                ),
                rowNumber: 2,
            },
        ]);
    });

    it('rejects a firm that disagrees with the plan serial and an account size that differs from it', () => {
        const other = firstEntry(({ firm }) => firm.id !== EVAL_PLAN.firm.id);
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, {
                    [AccountCsvColumn.Firm]: other.firm.id,
                    [AccountCsvColumn.Label]: 'wrong firm',
                }),
                row(EVAL_PLAN, {
                    [AccountCsvColumn.AccountSize]: '100000',
                    [AccountCsvColumn.Label]: 'wrong size',
                }),
            ),
            [],
        );

        expect(
            issuesOf(preview).map((issue) => [issue.rowNumber, issue.column]),
        ).toEqual([
            [2, AccountCsvColumn.Plan],
            [3, AccountCsvColumn.AccountSize],
        ]);
    });

    it('flags unreadable cells without also reporting the schema error for the same column', () => {
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, {
                    [AccountCsvColumn.Firm]: 'nofirm',
                    [AccountCsvColumn.MaxRiskPerTrade]: '250.125',
                    [AccountCsvColumn.Stage]: 'challenge',
                }),
            ),
            [],
        );

        expect(
            issuesOf(preview).map((issue) => [issue.column, issue.kind]),
        ).toEqual([
            [AccountCsvColumn.Firm, CsvIssueKind.Cell],
            [AccountCsvColumn.Stage, CsvIssueKind.Cell],
            [AccountCsvColumn.MaxRiskPerTrade, CsvIssueKind.Cell],
        ]);
    });

    it('flags a label repeated in the file on the later row only', () => {
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, { [AccountCsvColumn.Label]: 'Twin' }),
                row(EVAL_PLAN, { [AccountCsvColumn.Label]: 'Other' }),
                row(EVAL_PLAN, { [AccountCsvColumn.Label]: ' Twin' }),
            ),
            [],
        );

        expect(issuesOf(preview)).toEqual([
            {
                column: AccountCsvColumn.Label,
                kind: CsvIssueKind.Batch,
                message: 'repeats the label "Twin" from row 2',
                rowNumber: 4,
            },
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('flags a label already used by an active account, but not by an archived one', () => {
        const preview = previewAccountCsv(
            csv(
                row(EVAL_PLAN, { [AccountCsvColumn.Label]: 'Active one' }),
                row(EVAL_PLAN, { [AccountCsvColumn.Label]: 'Archived one' }),
            ),
            [
                { archivedAt: null, label: 'Active one' },
                { archivedAt: new Date('2026-01-01'), label: 'Archived one' },
            ],
        );

        expect(issuesOf(preview)).toEqual([
            {
                column: AccountCsvColumn.Label,
                kind: CsvIssueKind.Batch,
                message: 'an active account is already labeled "Active one"',
                rowNumber: 2,
            },
        ]);
    });

    it('flags a live start outside the documented range on its own row, whatever the stage, as the server does', () => {
        const live = documentedLiveStartEntry();
        const inRange = live.lowestStart.toFixed(2);
        const outOfRange = (live.highestStart + 10_000).toFixed(2);
        const outOfRangeCents = usdCents(
            Math.round((live.highestStart + 10_000) * 100),
        );
        const preview = previewAccountCsv(
            csv(
                row(live, {
                    [AccountCsvColumn.FundedOn]: '2026-09-10',
                    [AccountCsvColumn.Label]: 'Live fine',
                    [AccountCsvColumn.LiveStartBalance]: inRange,
                    [AccountCsvColumn.Stage]: AccountStage.Live,
                }),
                row(live, {
                    [AccountCsvColumn.FundedOn]: '2026-09-10',
                    [AccountCsvColumn.Label]: 'Live off',
                    [AccountCsvColumn.LiveStartBalance]: outOfRange,
                    [AccountCsvColumn.Stage]: AccountStage.Live,
                }),
                row(live, {
                    [AccountCsvColumn.FundedOn]: '2026-09-10',
                    [AccountCsvColumn.Label]: 'Funded off',
                    [AccountCsvColumn.LiveStartBalance]: outOfRange,
                    [AccountCsvColumn.Stage]: AccountStage.Funded,
                }),
                row(live, {
                    [AccountCsvColumn.FundedOn]: '2026-09-10',
                    [AccountCsvColumn.Label]: 'Funded no start',
                    [AccountCsvColumn.Stage]: AccountStage.Funded,
                }),
            ),
            [],
        );
        const [expected] = liveStartEntryIssues(live.plan, AccountStage.Live, {
            accountSize: live.plan.id.accountSize,
            dashboardConvention: DashboardBalanceConvention.Nominal,
            liveStartBalanceCents: outOfRangeCents,
        });

        expect(expected?.message).toContain('A live account after');
        expect(issuesOf(preview)).toEqual(
            [3, 4].map((rowNumber) => ({
                column: AccountCsvColumn.LiveStartBalance,
                kind: CsvIssueKind.Plausibility,
                message: expected?.message,
                rowNumber,
            })),
        );
        expect(csvCommitPayload(preview)).toBeNull();
        if (preview.kind !== CsvTableKind.Parsed) {
            throw new Error('expected a parsed preview');
        }
        expect(
            preview.rows.map((previewRow) => previewRow.value !== null),
        ).toEqual([true, false, false, true]);
    });

    it('fails the whole file on a missing required column or more than 200 rows', () => {
        expect(REQUIRED_ACCOUNT_CSV_COLUMNS).toEqual([
            AccountCsvColumn.Label,
            AccountCsvColumn.Firm,
            AccountCsvColumn.Plan,
            AccountCsvColumn.AccountSize,
            AccountCsvColumn.Stage,
            AccountCsvColumn.PurchasedOn,
        ]);
        expect(previewAccountCsv('label,firm\nx,apex', [])).toEqual({
            failure: {
                columns: [
                    AccountCsvColumn.Plan,
                    AccountCsvColumn.AccountSize,
                    AccountCsvColumn.Stage,
                    AccountCsvColumn.PurchasedOn,
                ],
                kind: CsvFailureKind.MissingColumns,
            },
            kind: CsvTableKind.Failed,
        });
        const rows = Array.from({ length: 201 }, (_, index) =>
            row(EVAL_PLAN, { [AccountCsvColumn.Label]: `a${index}` }),
        );
        expect(previewAccountCsv(csv(...rows), [])).toEqual({
            failure: {
                actual: 201,
                kind: CsvFailureKind.TooManyRows,
                limit: 200,
            },
            kind: CsvTableKind.Failed,
        });
        const atLimit = csv(...rows.slice(0, 200));
        expect(csvCommitPayload(previewAccountCsv(atLimit, []))).toHaveLength(
            200,
        );
    });
});
