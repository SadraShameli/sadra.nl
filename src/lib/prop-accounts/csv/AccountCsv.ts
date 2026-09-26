import { type z } from 'zod';

import type { PropAccountRow } from '~/server/db/schemas/prop';

import {
    AccountStage,
    DashboardBalanceConvention,
    type PersonalRules,
    PlanOptIn,
    planOptInField,
    type UsdCents,
} from '~/lib/prop-accounts/core';
import { FirmId, type PlanOptIns } from '~/lib/prop-calculator';
import {
    accountCreateSchema,
    MAX_IMPORT_ROWS,
} from '~/lib/schemas/propAccounts';

import {
    appendCsvIssues,
    buildCsvPreview,
    type CsvIssue,
    CsvIssueKind,
    type CsvPreview,
    type CsvRowReader,
    CsvTableKind,
    parseCsvTable,
    type SchemaPathColumns,
} from './CsvParse';

export enum AccountCsvColumn {
    AccountSize = 'accountSize',
    DailyLossLimit = 'dailyLossLimit',
    DailyProfitCap = 'dailyProfitCap',
    DashboardConvention = 'dashboardConvention',
    ExternalAlias = 'externalAlias',
    Firm = 'firm',
    FirstFundedTradeOn = 'firstFundedTradeOn',
    FundedOn = 'fundedOn',
    FundedReset = 'fundedReset',
    Label = 'label',
    LiveStartBalance = 'liveStartBalance',
    MaxRiskPerTrade = 'maxRiskPerTrade',
    MaxTradesPerDay = 'maxTradesPerDay',
    Notes = 'notes',
    OneTimeEarlyWithdrawal = 'oneTimeEarlyWithdrawal',
    PayoutRequestOverride = 'payoutRequestOverride',
    Plan = 'plan',
    PurchasedOn = 'purchasedOn',
    RetainedCushion = 'retainedCushion',
    Stage = 'stage',
    Tags = 'tags',
}

export type AccountCsvPreview = CsvPreview<AccountCsvColumn, AccountImportRow>;

export type AccountImportRow = z.output<typeof accountCreateSchema>;

export type ExistingAccountLabel = Pick<PropAccountRow, 'archivedAt' | 'label'>;

type PersonalMoneyRule = Exclude<keyof PersonalRules, 'maxTradesPerDay'>;

export const REQUIRED_ACCOUNT_CSV_COLUMNS: readonly AccountCsvColumn[] = [
    AccountCsvColumn.Label,
    AccountCsvColumn.Firm,
    AccountCsvColumn.Plan,
    AccountCsvColumn.AccountSize,
    AccountCsvColumn.Stage,
    AccountCsvColumn.PurchasedOn,
];

const OPT_IN_COLUMNS: Readonly<Record<PlanOptIn, AccountCsvColumn>> = {
    [PlanOptIn.FundedReset]: AccountCsvColumn.FundedReset,
    [PlanOptIn.OneTimeEarlyWithdrawal]: AccountCsvColumn.OneTimeEarlyWithdrawal,
};

const PERSONAL_MONEY_COLUMNS: Readonly<
    Record<PersonalMoneyRule, AccountCsvColumn>
> = {
    dailyLossLimitCents: AccountCsvColumn.DailyLossLimit,
    dailyProfitCapCents: AccountCsvColumn.DailyProfitCap,
    maxRiskPerTradeCents: AccountCsvColumn.MaxRiskPerTrade,
    payoutRequestOverrideCents: AccountCsvColumn.PayoutRequestOverride,
    retainedCushionCents: AccountCsvColumn.RetainedCushion,
};

const PERSONAL_MONEY_RULES = Object.keys(
    PERSONAL_MONEY_COLUMNS,
) as PersonalMoneyRule[];

export const ACCOUNT_CSV_COLUMNS: readonly AccountCsvColumn[] = [
    ...REQUIRED_ACCOUNT_CSV_COLUMNS,
    AccountCsvColumn.FundedOn,
    AccountCsvColumn.FirstFundedTradeOn,
    ...Object.values(PlanOptIn).map((optIn) => OPT_IN_COLUMNS[optIn]),
    AccountCsvColumn.DashboardConvention,
    AccountCsvColumn.LiveStartBalance,
    AccountCsvColumn.ExternalAlias,
    AccountCsvColumn.Tags,
    AccountCsvColumn.Notes,
    AccountCsvColumn.MaxTradesPerDay,
    ...PERSONAL_MONEY_RULES.map((rule) => PERSONAL_MONEY_COLUMNS[rule]),
];

const SCHEMA_PATH_COLUMNS: SchemaPathColumns<AccountCsvColumn> = [
    [AccountCsvColumn.AccountSize, ['accountSize']],
    [AccountCsvColumn.DashboardConvention, ['dashboardConvention']],
    [AccountCsvColumn.ExternalAlias, ['externalAlias']],
    [AccountCsvColumn.Firm, ['firmId']],
    [AccountCsvColumn.FirstFundedTradeOn, ['firstFundedTradeOn']],
    [AccountCsvColumn.FundedOn, ['fundedOn']],
    [AccountCsvColumn.Label, ['label']],
    [AccountCsvColumn.LiveStartBalance, ['liveStartBalanceCents']],
    [AccountCsvColumn.MaxTradesPerDay, ['personalRules', 'maxTradesPerDay']],
    [AccountCsvColumn.Notes, ['notes']],
    [AccountCsvColumn.Plan, ['planSerial']],
    [AccountCsvColumn.PurchasedOn, ['purchasedOn']],
    [AccountCsvColumn.Stage, ['stage']],
    [AccountCsvColumn.Tags, ['tags']],
    ...Object.values(PlanOptIn).map(
        (optIn) =>
            [OPT_IN_COLUMNS[optIn], ['optIns', planOptInField(optIn)]] as const,
    ),
    ...PERSONAL_MONEY_RULES.map(
        (rule) =>
            [PERSONAL_MONEY_COLUMNS[rule], ['personalRules', rule]] as const,
    ),
];

export function previewAccountCsv(
    text: string,
    existing: readonly ExistingAccountLabel[],
): AccountCsvPreview {
    const preview = buildCsvPreview(
        parseCsvTable(
            text,
            {
                all: ACCOUNT_CSV_COLUMNS,
                required: REQUIRED_ACCOUNT_CSV_COLUMNS,
            },
            MAX_IMPORT_ROWS,
        ),
        readAccountRow,
        REQUIRED_ACCOUNT_CSV_COLUMNS,
    );
    return appendCsvIssues(preview, labelIssues(preview, existing));
}

function labelIssues(
    preview: AccountCsvPreview,
    existing: readonly ExistingAccountLabel[],
): readonly CsvIssue[] {
    if (preview.kind === CsvTableKind.Failed) return [];
    const activeLabels = new Set(
        existing
            .filter((account) => account.archivedAt === null)
            .map((account) => account.label),
    );
    const firstRowOfLabel = new Map<string, number>();
    const issues: CsvIssue[] = [];
    for (const row of preview.rows) {
        const label = row.cells.get(AccountCsvColumn.Label)?.trim() ?? '';
        if (label === '') continue;
        const firstRow = firstRowOfLabel.get(label);
        const message = activeLabels.has(label)
            ? `an active account is already labeled "${label}"`
            : firstRow === undefined
              ? null
              : `repeats the label "${label}" from row ${firstRow}`;
        if (firstRow === undefined) firstRowOfLabel.set(label, row.rowNumber);
        if (message === null) continue;
        issues.push({
            column: AccountCsvColumn.Label,
            kind: CsvIssueKind.Batch,
            message,
            rowNumber: row.rowNumber,
        });
    }
    return issues;
}

function readAccountRow(
    reader: CsvRowReader<AccountCsvColumn>,
): AccountImportRow | undefined {
    const label = reader.text(AccountCsvColumn.Label);
    const firmId = reader.choice(AccountCsvColumn.Firm, FirmId);
    const planSerial = reader.text(AccountCsvColumn.Plan);
    const accountSize = reader.count(AccountCsvColumn.AccountSize);
    const stage = reader.choice(AccountCsvColumn.Stage, AccountStage);
    const purchasedOn = reader.date(AccountCsvColumn.PurchasedOn);
    const fundedOn = reader.date(AccountCsvColumn.FundedOn);
    const firstFundedTradeOn = reader.date(AccountCsvColumn.FirstFundedTradeOn);
    const optIns = readOptIns(reader);
    const dashboardConvention =
        reader.choice(
            AccountCsvColumn.DashboardConvention,
            DashboardBalanceConvention,
        ) ?? DashboardBalanceConvention.Nominal;
    const liveStartBalanceCents = reader.money(
        AccountCsvColumn.LiveStartBalance,
    );
    const externalAlias = reader.text(AccountCsvColumn.ExternalAlias);
    const tags = reader.list(AccountCsvColumn.Tags);
    const notes = reader.text(AccountCsvColumn.Notes);
    const personalRules = readPersonalRules(reader);
    const candidate = {
        accountSize,
        dashboardConvention,
        externalAlias,
        firmId,
        firstFundedTradeOn,
        fundedOn,
        label,
        liveStartBalanceCents,
        notes,
        optIns,
        personalRules,
        planSerial,
        purchasedOn,
        stage,
        tags,
    };
    const parsed = accountCreateSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    reader.addSchemaIssues(parsed.error.issues, SCHEMA_PATH_COLUMNS);
    return undefined;
}

function readOptIns(reader: CsvRowReader<AccountCsvColumn>): PlanOptIns {
    const optIns: Record<keyof PlanOptIns, boolean> = {
        takesFundedReset: false,
        takesOneTimeEarlyWithdrawal: false,
    };
    for (const optIn of Object.values(PlanOptIn)) {
        optIns[planOptInField(optIn)] =
            reader.flag(OPT_IN_COLUMNS[optIn]) ?? false;
    }
    return optIns;
}

function readPersonalRules(
    reader: CsvRowReader<AccountCsvColumn>,
): Partial<Record<keyof PersonalRules, number | UsdCents>> {
    const rules: Partial<Record<keyof PersonalRules, number | UsdCents>> = {};
    const maxTradesPerDay = reader.count(AccountCsvColumn.MaxTradesPerDay);
    if (maxTradesPerDay !== undefined) rules.maxTradesPerDay = maxTradesPerDay;
    for (const rule of PERSONAL_MONEY_RULES) {
        const cents = reader.money(PERSONAL_MONEY_COLUMNS[rule]);
        if (cents !== undefined) rules[rule] = cents;
    }
    return rules;
}
