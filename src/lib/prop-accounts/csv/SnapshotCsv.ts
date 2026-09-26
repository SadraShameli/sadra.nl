import { type z } from 'zod';

import type {
    PropAccountRow,
    PropAccountSnapshotRow,
} from '~/server/db/schemas/prop';

import {
    accountStageOn,
    AccountTracking,
    checkSnapshotEntry,
    describeUnresolvedPlan,
    isLedgerOnlySnapshotField,
    LEDGER_ONLY_SNAPSHOT_FIELD_LIST,
    NO_RECORDED_STAGE_STARTS,
    type PlanKeyInput,
    PlanKeyResolutionKind,
    resolvePlanKey,
    snapshotEntryIssueMessage,
    SnapshotSource,
    trackedAccountOf,
} from '~/lib/prop-accounts/core';
import {
    SnapshotInputField,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';
import {
    MAX_BULK_SNAPSHOTS,
    snapshotBulkCreateSchema,
    snapshotCreateSchema,
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

export enum SnapshotCsvColumn {
    Account = 'account',
    AsOf = 'asOf',
    Balance = 'balance',
    BalanceAtLastPayout = 'balanceAtLastPayout',
    CumulativePayout = 'cumulativePayout',
    CycleBestDayProfit = 'cycleBestDayProfit',
    DashboardFloor = 'dashboardFloor',
    EvalBestDayProfit = 'evalBestDayProfit',
    FloorAtLastPayout = 'floorAtLastPayout',
    HighestEodBalance = 'highestEodBalance',
    HighestIntradayBalance = 'highestIntradayBalance',
    LastPayoutOn = 'lastPayoutOn',
    LastTradedOn = 'lastTradedOn',
    PayoutsTaken = 'payoutsTaken',
    QualifyingDaysSinceLastPayout = 'qualifyingDaysSinceLastPayout',
    TradingDays = 'tradingDays',
}

export type SnapshotCsvAccount = Pick<PlanKeyInput, 'optIns' | 'readIssues'> &
    Pick<
        PropAccountRow,
        | 'accountSize'
        | 'archivedAt'
        | 'dashboardConvention'
        | 'externalFirmId'
        | 'firmId'
        | 'fundedOn'
        | 'id'
        | 'label'
        | 'liveStartBalanceCents'
        | 'planLabel'
        | 'planSerial'
        | 'purchasedOn'
        | 'stage'
        | 'tracking'
    >;

export type SnapshotCsvPreview = CsvPreview<
    SnapshotCsvColumn,
    SnapshotImportRow
>;

export type SnapshotCsvStored = Pick<
    PropAccountSnapshotRow,
    'accountId' | 'asOf'
>;

export type SnapshotImportRow = z.output<typeof snapshotCreateSchema>;

interface RowPlausibility {
    readonly blocking: readonly CsvIssue[];
    readonly warnings: readonly CsvIssue[];
}

type SnapshotValueColumn = Exclude<
    SnapshotCsvColumn,
    SnapshotCsvColumn.Account
>;

export const REQUIRED_SNAPSHOT_CSV_COLUMNS: readonly SnapshotCsvColumn[] = [
    SnapshotCsvColumn.Account,
    SnapshotCsvColumn.AsOf,
    SnapshotCsvColumn.Balance,
];

export const SNAPSHOT_CSV_COLUMNS: readonly SnapshotCsvColumn[] = [
    ...REQUIRED_SNAPSHOT_CSV_COLUMNS,
    SnapshotCsvColumn.HighestEodBalance,
    SnapshotCsvColumn.HighestIntradayBalance,
    SnapshotCsvColumn.DashboardFloor,
    SnapshotCsvColumn.TradingDays,
    SnapshotCsvColumn.PayoutsTaken,
    SnapshotCsvColumn.QualifyingDaysSinceLastPayout,
    SnapshotCsvColumn.LastPayoutOn,
    SnapshotCsvColumn.BalanceAtLastPayout,
    SnapshotCsvColumn.FloorAtLastPayout,
    SnapshotCsvColumn.CumulativePayout,
    SnapshotCsvColumn.CycleBestDayProfit,
    SnapshotCsvColumn.EvalBestDayProfit,
    SnapshotCsvColumn.LastTradedOn,
];

const LEDGER_ONLY_FIELD_MESSAGE = `a ledger-only account takes only ${LEDGER_ONLY_SNAPSHOT_FIELD_LIST}; this field feeds plan rules it does not have`;

const UNRESOLVED_PLAN_MESSAGE =
    'the plan cannot be resolved, so the balances cannot be checked';

const PLAUSIBILITY_COLUMNS: Readonly<
    Record<SnapshotInputField, SnapshotCsvColumn>
> = {
    [SnapshotInputField.AsOf]: SnapshotCsvColumn.AsOf,
    [SnapshotInputField.Balance]: SnapshotCsvColumn.Balance,
    [SnapshotInputField.BalanceAtLastPayout]:
        SnapshotCsvColumn.BalanceAtLastPayout,
    [SnapshotInputField.CumulativePayout]: SnapshotCsvColumn.CumulativePayout,
    [SnapshotInputField.CycleBestDayProfit]:
        SnapshotCsvColumn.CycleBestDayProfit,
    [SnapshotInputField.DashboardConvention]: SnapshotCsvColumn.Account,
    [SnapshotInputField.DashboardFloor]: SnapshotCsvColumn.DashboardFloor,
    [SnapshotInputField.EvalBestDayProfit]: SnapshotCsvColumn.EvalBestDayProfit,
    [SnapshotInputField.FirstFundedTradeOn]: SnapshotCsvColumn.Account,
    [SnapshotInputField.FloorAtLastPayout]: SnapshotCsvColumn.FloorAtLastPayout,
    [SnapshotInputField.FundedOn]: SnapshotCsvColumn.Account,
    [SnapshotInputField.FundedResetsUsed]: SnapshotCsvColumn.Account,
    [SnapshotInputField.HighestEodBalance]: SnapshotCsvColumn.HighestEodBalance,
    [SnapshotInputField.HighestIntradayBalance]:
        SnapshotCsvColumn.HighestIntradayBalance,
    [SnapshotInputField.LastPayoutOn]: SnapshotCsvColumn.LastPayoutOn,
    [SnapshotInputField.LastTradedOn]: SnapshotCsvColumn.LastTradedOn,
    [SnapshotInputField.LiveStartBalance]: SnapshotCsvColumn.Account,
    [SnapshotInputField.PayoutsTaken]: SnapshotCsvColumn.PayoutsTaken,
    [SnapshotInputField.PendingPayouts]: SnapshotCsvColumn.Account,
    [SnapshotInputField.PurchasedOn]: SnapshotCsvColumn.Account,
    [SnapshotInputField.QualifyingDaysSinceLastPayout]:
        SnapshotCsvColumn.QualifyingDaysSinceLastPayout,
    [SnapshotInputField.Stage]: SnapshotCsvColumn.Account,
    [SnapshotInputField.TradingDays]: SnapshotCsvColumn.TradingDays,
};

const STORED_SNAPSHOT_MESSAGE =
    'a snapshot for this account and date is already stored; remove it first or use another date';

const SNAPSHOT_FIELDS: Readonly<
    Record<SnapshotValueColumn, keyof SnapshotImportRow>
> = {
    [SnapshotCsvColumn.AsOf]: 'asOf',
    [SnapshotCsvColumn.Balance]: 'balanceCents',
    [SnapshotCsvColumn.BalanceAtLastPayout]: 'balanceAtLastPayoutCents',
    [SnapshotCsvColumn.CumulativePayout]: 'cumulativePayoutCents',
    [SnapshotCsvColumn.CycleBestDayProfit]: 'cycleBestDayProfitCents',
    [SnapshotCsvColumn.DashboardFloor]: 'dashboardFloorCents',
    [SnapshotCsvColumn.EvalBestDayProfit]: 'evalBestDayProfitCents',
    [SnapshotCsvColumn.FloorAtLastPayout]: 'floorAtLastPayoutCents',
    [SnapshotCsvColumn.HighestEodBalance]: 'highestEodBalanceCents',
    [SnapshotCsvColumn.HighestIntradayBalance]: 'highestIntradayBalanceCents',
    [SnapshotCsvColumn.LastPayoutOn]: 'lastPayoutOn',
    [SnapshotCsvColumn.LastTradedOn]: 'lastTradedOn',
    [SnapshotCsvColumn.PayoutsTaken]: 'payoutsTaken',
    [SnapshotCsvColumn.QualifyingDaysSinceLastPayout]:
        'qualifyingDaysSinceLastPayout',
    [SnapshotCsvColumn.TradingDays]: 'tradingDays',
};

const SCHEMA_PATH_COLUMNS: SchemaPathColumns<SnapshotCsvColumn> = [
    [SnapshotCsvColumn.Account, ['accountId']],
    ...SNAPSHOT_CSV_COLUMNS.flatMap((column) =>
        column === SnapshotCsvColumn.Account
            ? []
            : [[column, [SNAPSHOT_FIELDS[column]]] as const],
    ),
];

export function previewSnapshotCsv(
    text: string,
    accounts: readonly SnapshotCsvAccount[],
    stored: readonly SnapshotCsvStored[],
): SnapshotCsvPreview {
    const active = activeAccounts(accounts);
    const activeIds = new Map(
        active.map((account) => [account.label, account.id] as const),
    );
    const preview = buildCsvPreview(
        parseCsvTable(
            text,
            {
                all: SNAPSHOT_CSV_COLUMNS,
                required: REQUIRED_SNAPSHOT_CSV_COLUMNS,
            },
            MAX_BULK_SNAPSHOTS,
        ),
        (reader) => readSnapshotRow(reader, activeIds),
        REQUIRED_SNAPSHOT_CSV_COLUMNS,
    );
    const withBatch = appendCsvIssues(preview, batchIssues(preview));
    const withStored = appendCsvIssues(
        withBatch,
        storedSnapshotIssues(withBatch, stored),
    );
    return appendCsvIssues(
        withStored,
        rowsPlausibility(preview, active).flatMap((row) => row.blocking),
    );
}

export function snapshotCsvWarnings(
    preview: SnapshotCsvPreview,
    accounts: readonly SnapshotCsvAccount[],
): readonly CsvIssue[] {
    return rowsPlausibility(preview, activeAccounts(accounts)).flatMap(
        (row) => row.warnings,
    );
}

function activeAccounts(
    accounts: readonly SnapshotCsvAccount[],
): readonly SnapshotCsvAccount[] {
    return accounts.filter((account) => account.archivedAt === null);
}

function batchIssues(preview: SnapshotCsvPreview): readonly CsvIssue[] {
    if (preview.kind === CsvTableKind.Failed) return [];
    const valid = preview.rows.flatMap((row) =>
        row.value === null
            ? []
            : [{ rowNumber: row.rowNumber, value: row.value }],
    );
    if (valid.length === 0) return [];
    const parsed = snapshotBulkCreateSchema.safeParse(
        valid.map((row) => row.value),
    );
    if (parsed.success) return [];
    return parsed.error.issues.flatMap((issue) => {
        const [index, field] = issue.path;
        const row = typeof index === 'number' ? valid[index] : undefined;
        if (row === undefined) return [];
        return [
            {
                column: columnOfField(field),
                kind: CsvIssueKind.Batch,
                message: issue.message,
                rowNumber: row.rowNumber,
            },
        ];
    });
}

function columnOfField(
    field: PropertyKey | undefined,
): null | SnapshotCsvColumn {
    const match = SCHEMA_PATH_COLUMNS.find(([, path]) => path[0] === field);
    return match === undefined ? null : match[0];
}

function ledgerOnlyPlausibility(
    rowNumber: number,
    snapshot: SnapshotImportRow,
): RowPlausibility {
    return {
        blocking: SNAPSHOT_CSV_COLUMNS.flatMap((column) =>
            column === SnapshotCsvColumn.Account ||
            isLedgerOnlySnapshotField(SNAPSHOT_FIELDS[column]) ||
            snapshot[SNAPSHOT_FIELDS[column]] === null
                ? []
                : [
                      {
                          column,
                          kind: CsvIssueKind.Plausibility,
                          message: LEDGER_ONLY_FIELD_MESSAGE,
                          rowNumber,
                      },
                  ],
        ),
        warnings: [],
    };
}

function plausibilityCsvIssue(
    rowNumber: number,
    issue: SnapshotPlausibilityIssue,
): CsvIssue {
    return {
        column: PLAUSIBILITY_COLUMNS[issue.field],
        kind: CsvIssueKind.Plausibility,
        message: snapshotEntryIssueMessage(issue),
        rowNumber,
    };
}

function readAccountId(
    reader: CsvRowReader<SnapshotCsvColumn>,
    activeIds: ReadonlyMap<string, string>,
): string | undefined {
    const label = reader.text(SnapshotCsvColumn.Account);
    if (label === undefined) return undefined;
    const accountId = activeIds.get(label);
    if (accountId === undefined) {
        reader.addIssue(
            SnapshotCsvColumn.Account,
            CsvIssueKind.Cell,
            `no active account is labeled "${label}"`,
        );
    }
    return accountId;
}

function readSnapshotRow(
    reader: CsvRowReader<SnapshotCsvColumn>,
    activeIds: ReadonlyMap<string, string>,
): SnapshotImportRow | undefined {
    const accountId = readAccountId(reader, activeIds);
    const asOf = reader.date(SnapshotCsvColumn.AsOf);
    const balanceCents = reader.money(SnapshotCsvColumn.Balance);
    const highestEodBalanceCents = reader.money(
        SnapshotCsvColumn.HighestEodBalance,
    );
    const highestIntradayBalanceCents = reader.money(
        SnapshotCsvColumn.HighestIntradayBalance,
    );
    const dashboardFloorCents = reader.money(SnapshotCsvColumn.DashboardFloor);
    const tradingDays = reader.count(SnapshotCsvColumn.TradingDays);
    const payoutsTaken = reader.count(SnapshotCsvColumn.PayoutsTaken);
    const qualifyingDaysSinceLastPayout = reader.count(
        SnapshotCsvColumn.QualifyingDaysSinceLastPayout,
    );
    const lastPayoutOn = reader.date(SnapshotCsvColumn.LastPayoutOn);
    const balanceAtLastPayoutCents = reader.money(
        SnapshotCsvColumn.BalanceAtLastPayout,
    );
    const floorAtLastPayoutCents = reader.money(
        SnapshotCsvColumn.FloorAtLastPayout,
    );
    const cumulativePayoutCents = reader.money(
        SnapshotCsvColumn.CumulativePayout,
    );
    const cycleBestDayProfitCents = reader.money(
        SnapshotCsvColumn.CycleBestDayProfit,
    );
    const evalBestDayProfitCents = reader.money(
        SnapshotCsvColumn.EvalBestDayProfit,
    );
    const lastTradedOn = reader.date(SnapshotCsvColumn.LastTradedOn);
    const parsed = snapshotCreateSchema.safeParse({
        accountId,
        asOf,
        balanceAtLastPayoutCents,
        balanceCents,
        cumulativePayoutCents,
        cycleBestDayProfitCents,
        dashboardFloorCents,
        evalBestDayProfitCents,
        floorAtLastPayoutCents,
        highestEodBalanceCents,
        highestIntradayBalanceCents,
        lastPayoutOn,
        lastTradedOn,
        payoutsTaken,
        qualifyingDaysSinceLastPayout,
        source: SnapshotSource.Import,
        tradingDays,
    });
    if (parsed.success) return parsed.data;
    reader.addSchemaIssues(parsed.error.issues, SCHEMA_PATH_COLUMNS);
    return undefined;
}

function rowPlausibility(
    rowNumber: number,
    stored: SnapshotCsvAccount,
    snapshot: SnapshotImportRow,
): RowPlausibility {
    const account = trackedAccountOf(stored);
    if (account.tracking === AccountTracking.LedgerOnly) {
        return ledgerOnlyPlausibility(rowNumber, snapshot);
    }
    const resolution = resolvePlanKey(account);
    if (resolution.kind === PlanKeyResolutionKind.Unresolved) {
        return {
            blocking: [
                {
                    column: SnapshotCsvColumn.Account,
                    kind: CsvIssueKind.Cell,
                    message: `${UNRESOLVED_PLAN_MESSAGE}: ${describeUnresolvedPlan(account, resolution.reason)}`,
                    rowNumber,
                },
            ],
            warnings: [],
        };
    }
    const { plan } = resolution;
    const stage = accountStageOn(
        account,
        plan,
        NO_RECORDED_STAGE_STARTS,
        snapshot.asOf,
    );
    const { blocking, warnings } = checkSnapshotEntry(
        plan,
        stage,
        account,
        snapshot,
    );
    return {
        blocking: blocking.map((issue) =>
            plausibilityCsvIssue(rowNumber, issue),
        ),
        warnings: warnings.map((issue) =>
            plausibilityCsvIssue(rowNumber, issue),
        ),
    };
}

function rowsPlausibility(
    preview: SnapshotCsvPreview,
    accounts: readonly SnapshotCsvAccount[],
): readonly RowPlausibility[] {
    if (preview.kind === CsvTableKind.Failed) return [];
    const byId = new Map(
        accounts.map((account) => [account.id, account] as const),
    );
    return preview.rows.flatMap((row) => {
        const { rowNumber, value } = row;
        if (value === null) return [];
        const account = byId.get(value.accountId);
        return account === undefined
            ? []
            : [rowPlausibility(rowNumber, account, value)];
    });
}

function snapshotKey(accountId: string, asOf: string): string {
    return JSON.stringify([accountId, asOf]);
}

function storedSnapshotIssues(
    preview: SnapshotCsvPreview,
    stored: readonly SnapshotCsvStored[],
): readonly CsvIssue[] {
    if (preview.kind === CsvTableKind.Failed) return [];
    const storedKeys = new Set(
        stored.map((snapshot) =>
            snapshotKey(snapshot.accountId, snapshot.asOf),
        ),
    );
    return preview.rows.flatMap((row) =>
        row.value !== null &&
        storedKeys.has(snapshotKey(row.value.accountId, row.value.asOf))
            ? [
                  {
                      column: SnapshotCsvColumn.AsOf,
                      kind: CsvIssueKind.Batch,
                      message: STORED_SNAPSHOT_MESSAGE,
                      rowNumber: row.rowNumber,
                  },
              ]
            : [],
    );
}
