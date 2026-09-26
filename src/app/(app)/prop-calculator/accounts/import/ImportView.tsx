'use client';

import { CircleCheck, FileUp, TriangleAlert } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { Textarea } from '~/components/ui/Textarea';
import {
    AccountStage,
    AccountTracking,
    DashboardBalanceConvention,
    type ExternalFirmName,
} from '~/lib/prop-accounts';
import {
    ACCOUNT_CSV_COLUMNS,
    AccountCsvColumn,
    csvCommitPayload,
    CsvFailureKind,
    type CsvIssue,
    csvIssues,
    type CsvPreview,
    CsvTableKind,
    describeCsvFailure,
    type ExistingAccountLabel,
    MAX_CSV_BYTES,
    previewAccountCsv,
    previewSnapshotCsv,
    REQUIRED_ACCOUNT_CSV_COLUMNS,
    REQUIRED_SNAPSHOT_CSV_COLUMNS,
    SNAPSHOT_CSV_COLUMNS,
    type SnapshotCsvAccount,
    SnapshotCsvColumn,
    snapshotCsvWarnings,
} from '~/lib/prop-accounts/csv';
import { ALL_FIRMS, FirmId } from '~/lib/prop-calculator';
import { MAX_IMPORT_ROWS } from '~/lib/schemas/propAccounts';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import { ACCOUNT_LIST_INPUT } from '../_components/accountListFilters';
import {
    accountOptInOptions,
    accountPlanOptions,
    planTagLabel,
} from '../_components/accountPlanOptions';

enum ImportKind {
    Accounts = 'accounts',
    Snapshots = 'snapshots',
}

interface ImportNoun {
    readonly plural: string;
    readonly singular: string;
}

interface ImportPanelProperties<Column extends string, Value> {
    readonly columns: readonly Column[];
    readonly commitError: null | string;
    readonly describeColumn: (column: Column) => string;
    readonly isCommitting: boolean;
    readonly kind: ImportKind;
    readonly noun: ImportNoun;
    readonly onCommit: (values: readonly Value[]) => void;
    readonly onTextChange: (text: string) => void;
    readonly preview: CsvPreview<Column, Value> | null;
    readonly previewIsCurrent: boolean;
    readonly required: readonly Column[];
    readonly shownColumns: readonly Column[];
    readonly text: string;
    readonly warnings: readonly CsvIssue[];
}

interface ImportText {
    readonly clearCommitted: () => void;
    readonly markCommitted: () => void;
    readonly setText: (text: string) => void;
    readonly text: string;
}

interface PlanReferenceRow {
    readonly firmId: FirmId;
    readonly label: string;
    readonly optIns: string;
    readonly planSerial: string;
    readonly size: number;
    readonly tags: string;
}

const ACCOUNT_NOUN: ImportNoun = { plural: 'accounts', singular: 'account' };
const NO_CSV_WARNINGS: readonly CsvIssue[] = [];
const SNAPSHOT_NOUN: ImportNoun = {
    plural: 'snapshots',
    singular: 'snapshot',
};

const DATE_HINT = 'Date written as YYYY-MM-DD.';
const MONEY_HINT =
    'Dollars like 1234.56; a $ sign is fine, and an amount with thousands separators needs quotes.';
const PERSONAL_CAP_HINT =
    'Optional personal cap in dollars, tighter than the plan.';

const ACCOUNT_COLUMN_HINTS: Readonly<Record<AccountCsvColumn, string>> = {
    [AccountCsvColumn.AccountSize]: 'Whole dollars, for example 50000.',
    [AccountCsvColumn.DailyLossLimit]: PERSONAL_CAP_HINT,
    [AccountCsvColumn.DailyProfitCap]: PERSONAL_CAP_HINT,
    [AccountCsvColumn.DashboardConvention]: `${Object.values(DashboardBalanceConvention).join(' or ')}; empty means ${DashboardBalanceConvention.Nominal}.`,
    [AccountCsvColumn.ExternalAlias]:
        'The account name the firm shows. Never paste a password or login.',
    [AccountCsvColumn.Firm]: `One of: ${Object.values(FirmId).join(', ')}. On a ${AccountTracking.LedgerOnly} row it can also be the name of one of your own firms.`,
    [AccountCsvColumn.FirstFundedTradeOn]: DATE_HINT,
    [AccountCsvColumn.FundedOn]: DATE_HINT,
    [AccountCsvColumn.FundedReset]:
        'yes or no; only on plans that offer a funded reset.',
    [AccountCsvColumn.Label]:
        'Your name for the account, unique among active accounts.',
    [AccountCsvColumn.LiveStartBalance]: `For live accounts. ${MONEY_HINT}`,
    [AccountCsvColumn.MaxRiskPerTrade]: PERSONAL_CAP_HINT,
    [AccountCsvColumn.MaxTradesPerDay]:
        'Optional personal cap on trades per day, a whole number.',
    [AccountCsvColumn.Notes]: 'Free text.',
    [AccountCsvColumn.OneTimeEarlyWithdrawal]:
        'yes or no; only on plans that offer it.',
    [AccountCsvColumn.PayoutRequestOverride]:
        'Optional personal payout request in dollars; the plan minimum still applies.',
    [AccountCsvColumn.Plan]: `The plan serial from the plan list below; on a ${AccountTracking.LedgerOnly} row, the plan name as the firm shows it.`,
    [AccountCsvColumn.PurchasedOn]: DATE_HINT,
    [AccountCsvColumn.RetainedCushion]:
        'Optional personal retained cushion in dollars.',
    [AccountCsvColumn.Stage]: `${Object.values(AccountStage).join(', ')}.`,
    [AccountCsvColumn.Tags]:
        'Comma separated; wrap the cell in quotes when it holds a comma.',
    [AccountCsvColumn.Tracking]: `${Object.values(AccountTracking).join(' or ')}; empty means ${AccountTracking.Modeled}. A ${AccountTracking.LedgerOnly} account takes any firm, size and plan name, counts in your cash and firm figures, and is never valued by the engine.`,
};

const SNAPSHOT_COLUMN_HINTS: Readonly<Record<SnapshotCsvColumn, string>> = {
    [SnapshotCsvColumn.Account]: 'The label of an active account.',
    [SnapshotCsvColumn.AsOf]: DATE_HINT,
    [SnapshotCsvColumn.Balance]: `As the firm dashboard shows it. ${MONEY_HINT}`,
    [SnapshotCsvColumn.BalanceAtLastPayout]: MONEY_HINT,
    [SnapshotCsvColumn.CumulativePayout]: `What you received after the profit split. ${MONEY_HINT}`,
    [SnapshotCsvColumn.CycleBestDayProfit]: MONEY_HINT,
    [SnapshotCsvColumn.DashboardFloor]: `The max loss level on the dashboard. ${MONEY_HINT}`,
    [SnapshotCsvColumn.EvalBestDayProfit]: MONEY_HINT,
    [SnapshotCsvColumn.FloorAtLastPayout]: MONEY_HINT,
    [SnapshotCsvColumn.HighestEodBalance]: `The highest end-of-day balance so far. ${MONEY_HINT}`,
    [SnapshotCsvColumn.HighestIntradayBalance]: MONEY_HINT,
    [SnapshotCsvColumn.LastPayoutOn]: DATE_HINT,
    [SnapshotCsvColumn.LastTradedOn]: DATE_HINT,
    [SnapshotCsvColumn.PayoutsTaken]: 'A whole number.',
    [SnapshotCsvColumn.QualifyingDaysSinceLastPayout]: 'A whole number.',
    [SnapshotCsvColumn.TradingDays]: 'A whole number.',
};

const ACCOUNT_SHOWN_COLUMNS: readonly AccountCsvColumn[] = [
    AccountCsvColumn.Label,
    AccountCsvColumn.Firm,
    AccountCsvColumn.Plan,
    AccountCsvColumn.Stage,
];

const SNAPSHOT_SHOWN_COLUMNS: readonly SnapshotCsvColumn[] = [
    SnapshotCsvColumn.Account,
    SnapshotCsvColumn.AsOf,
    SnapshotCsvColumn.Balance,
];

export function ImportView() {
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);

    if (accountsQuery.data === undefined) {
        return accountsQuery.isError ? (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>The accounts could not be loaded</AlertTitle>
                <AlertDescription>
                    {accountsQuery.error.message} Import needs them to check
                    labels, so it is paused.
                </AlertDescription>
            </Alert>
        ) : (
            <Skeleton className="h-64 w-full" />
        );
    }

    return (
        <Tabs
            className="flex flex-col gap-6"
            defaultValue={ImportKind.Accounts}
        >
            {accountsQuery.isError && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>
                        The account list could not be refreshed
                    </AlertTitle>
                    <AlertDescription>
                        {accountsQuery.error.message} Labels are checked against
                        the list loaded earlier, which may be out of date.
                        Reload the page before importing if you changed an
                        account since then.
                    </AlertDescription>
                </Alert>
            )}
            <TabsList className="self-start">
                <TabsTrigger value={ImportKind.Accounts}>Accounts</TabsTrigger>
                <TabsTrigger value={ImportKind.Snapshots}>
                    Snapshots
                </TabsTrigger>
            </TabsList>
            <TabsContent value={ImportKind.Accounts}>
                <AccountImportTab accounts={accountsQuery.data} />
            </TabsContent>
            <TabsContent value={ImportKind.Snapshots}>
                <SnapshotImport accounts={accountsQuery.data} />
            </TabsContent>
        </Tabs>
    );
}

function AccountImport({
    accounts,
    externalFirms,
}: {
    accounts: readonly ExistingAccountLabel[];
    externalFirms: readonly ExternalFirmName[];
}) {
    const { clearCommitted, markCommitted, setText, text } = useImportText();
    const deferredText = useDeferredValue(text);
    const utilities = api.useUtils();
    const importMany = api.propAccounts.account.importMany.useMutation({
        onSuccess: (created) => {
            toast.success(`Imported ${countOf(created.length, ACCOUNT_NOUN)}`);
            clearCommitted();
            return utilities.propAccounts.invalidate();
        },
    });
    const preview = useMemo(
        () =>
            deferredText.trim() === ''
                ? null
                : previewAccountCsv(deferredText, accounts, externalFirms),
        [deferredText, accounts, externalFirms],
    );

    return (
        <div className="flex flex-col gap-6">
            <CsvImportPanel
                columns={ACCOUNT_CSV_COLUMNS}
                commitError={importMany.error?.message ?? null}
                describeColumn={(column) => ACCOUNT_COLUMN_HINTS[column]}
                isCommitting={importMany.isPending}
                kind={ImportKind.Accounts}
                noun={ACCOUNT_NOUN}
                onCommit={(values) => {
                    markCommitted();
                    importMany.mutate([...values]);
                }}
                onTextChange={(next) => {
                    setText(next);
                    if (!importMany.isPending) importMany.reset();
                }}
                preview={preview}
                previewIsCurrent={deferredText === text}
                required={REQUIRED_ACCOUNT_CSV_COLUMNS}
                shownColumns={ACCOUNT_SHOWN_COLUMNS}
                text={text}
                warnings={NO_CSV_WARNINGS}
            />
            <PlanReference />
        </div>
    );
}

function AccountImportTab({
    accounts,
}: {
    accounts: readonly ExistingAccountLabel[];
}) {
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    if (externalFirmsQuery.data !== undefined) {
        return (
            <AccountImport
                accounts={accounts}
                externalFirms={externalFirmsQuery.data}
            />
        );
    }
    return externalFirmsQuery.isError ? (
        <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Your firms could not be loaded</AlertTitle>
            <AlertDescription>
                {externalFirmsQuery.error.message} Account import needs them to
                check firm names, so it is paused.
            </AlertDescription>
        </Alert>
    ) : (
        <Skeleton className="h-64 w-full" />
    );
}

function ColumnReference<Column extends string>({
    columns,
    describeColumn,
    required,
}: {
    columns: readonly Column[];
    describeColumn: (column: Column) => string;
    required: readonly Column[];
}) {
    return (
        <details className="rounded-md border border-border p-4 text-sm">
            <summary className="cursor-pointer font-medium">
                Columns and formats
            </summary>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
                {columns.map((column) => (
                    <div className="contents" key={column}>
                        <dt className="font-mono text-xs">
                            {column}
                            {required.includes(column) && (
                                <Badge className="ml-2" variant="secondary">
                                    required
                                </Badge>
                            )}
                        </dt>
                        <dd className="text-muted-foreground">
                            {describeColumn(column)}
                        </dd>
                    </div>
                ))}
            </dl>
        </details>
    );
}

function countOf(count: number, noun: ImportNoun): string {
    return `${count} ${count === 1 ? noun.singular : noun.plural}`;
}

function CsvImportPanel<Column extends string, Value>({
    columns,
    commitError,
    describeColumn,
    isCommitting,
    kind,
    noun,
    onCommit,
    onTextChange,
    preview,
    previewIsCurrent,
    required,
    shownColumns,
    text,
    warnings,
}: ImportPanelProperties<Column, Value>) {
    const baseId = useId();
    const textId = `${baseId}-text`;
    const fileId = `${baseId}-file`;
    const [fileError, setFileError] = useState<null | string>(null);
    const payload = preview === null ? null : csvCommitPayload(preview);
    const issues = preview === null ? [] : csvIssues(preview);
    const canCommit = payload !== null && previewIsCurrent && !isCommitting;

    const readFile = async (input: HTMLInputElement) => {
        const file = input.files?.[0];
        input.value = '';
        if (file === undefined) return;
        if (file.size > MAX_CSV_BYTES) {
            setFileError(
                describeCsvFailure({
                    actual: file.size,
                    kind: CsvFailureKind.TooLarge,
                    limit: MAX_CSV_BYTES,
                }),
            );
            return;
        }
        try {
            const content = await file.text();
            setFileError(null);
            onTextChange(content);
        } catch {
            setFileError(`The file ${file.name} could not be read`);
        }
    };

    return (
        <section
            aria-labelledby={`${baseId}-heading`}
            className={cn(
                `app-prop-accounts__import-${kind}`,
                'flex flex-col gap-4',
            )}
        >
            <h2 className="text-xl font-semibold" id={`${baseId}-heading`}>
                Import {noun.plural}
            </h2>
            <ColumnReference
                columns={columns}
                describeColumn={describeColumn}
                required={required}
            />
            <div className="flex flex-col gap-2">
                <Label htmlFor={textId}>CSV text</Label>
                <Textarea
                    className="min-h-48 font-mono text-xs"
                    disabled={isCommitting}
                    id={textId}
                    onChange={(event) => {
                        setFileError(null);
                        onTextChange(event.target.value);
                    }}
                    placeholder={columns.join(',')}
                    spellCheck={false}
                    value={text}
                />
                <p className="text-xs text-muted-foreground">
                    Comma or tab separated, with the header row first. At most{' '}
                    {MAX_IMPORT_ROWS} rows and 256 KB. Row numbers below count
                    the header as row 1.
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <Label className="sr-only" htmlFor={fileId}>
                    Upload a CSV file of {noun.plural}
                </Label>
                <Input
                    accept=".csv,.tsv,.txt,text/csv,text/plain"
                    className="max-w-xs"
                    disabled={isCommitting}
                    id={fileId}
                    onChange={(event) => {
                        void readFile(event.currentTarget);
                    }}
                    type="file"
                />
                {text !== '' && (
                    <Button
                        disabled={isCommitting}
                        onClick={() => {
                            setFileError(null);
                            onTextChange('');
                        }}
                        type="button"
                        variant="outline"
                    >
                        Clear
                    </Button>
                )}
            </div>
            {fileError !== null && (
                <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>The file was not loaded</AlertTitle>
                    <AlertDescription>{fileError}</AlertDescription>
                </Alert>
            )}
            {preview !== null && preview.kind === CsvTableKind.Failed && (
                <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>This CSV cannot be imported</AlertTitle>
                    <AlertDescription>
                        {describeCsvFailure(preview.failure)}
                    </AlertDescription>
                </Alert>
            )}
            {preview !== null && preview.kind === CsvTableKind.Parsed && (
                <PreviewTable
                    issueCount={issues.length}
                    preview={preview}
                    shownColumns={shownColumns}
                    warnings={warnings}
                />
            )}
            {commitError !== null && (
                <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>Nothing was imported</AlertTitle>
                    <AlertDescription>{commitError}</AlertDescription>
                </Alert>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    disabled={!canCommit}
                    onClick={() => {
                        if (payload !== null) onCommit(payload);
                    }}
                    type="button"
                >
                    <FileUp />
                    {payload === null
                        ? `Import ${noun.plural}`
                        : `Import ${countOf(payload.length, noun)}`}
                </Button>
                {preview !== null && payload === null && (
                    <p className="text-sm text-muted-foreground">
                        Fix every issue first; an import saves all rows or none.
                    </p>
                )}
            </div>
        </section>
    );
}

function describeIssue(issue: CsvIssue): string {
    return issue.column === null
        ? `The row ${issue.message}`
        : `${issue.column}: ${issue.message}`;
}

function PlanReference() {
    const rows = useMemo(() => planReferenceRows(), []);
    return (
        <details className="rounded-md border border-border p-4 text-sm">
            <summary className="cursor-pointer font-medium">
                Plan serials for the plan column
            </summary>
            <Table className="mt-3">
                <TableHeader>
                    <TableRow>
                        <TableHead>firm</TableHead>
                        <TableHead>plan</TableHead>
                        <TableHead>accountSize</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Offered opt-ins</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.planSerial}>
                            <TableCell className="font-mono text-xs">
                                {row.firmId}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                                {row.planSerial}
                            </TableCell>
                            <TableCell className="tabular-nums">
                                {row.size}
                            </TableCell>
                            <TableCell>
                                {row.label}
                                {row.tags !== '' && (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                        ({row.tags})
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {row.optIns === '' ? 'None' : row.optIns}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </details>
    );
}

function planReferenceRows(): readonly PlanReferenceRow[] {
    return ALL_FIRMS.flatMap((firm) =>
        accountPlanOptions(firm).map((option) => {
            const plan = firm.findPlanBySerial(option.planSerial);
            return {
                firmId: firm.id,
                label: option.label,
                optIns:
                    plan === null
                        ? ''
                        : accountOptInOptions(plan)
                              .map((optIn) => optIn.label)
                              .join(', '),
                planSerial: option.planSerial,
                size: plan?.id.accountSize ?? 0,
                tags: option.tags.map((tag) => planTagLabel(tag)).join(', '),
            };
        }),
    );
}

function PreviewTable<Column extends string, Value>({
    issueCount,
    preview,
    shownColumns,
    warnings,
}: {
    issueCount: number;
    preview: Extract<CsvPreview<Column, Value>, { kind: CsvTableKind.Parsed }>;
    shownColumns: readonly Column[];
    warnings: readonly CsvIssue[];
}) {
    const rowsWithIssues = preview.rows.filter(
        (row) => row.issues.length > 0,
    ).length;
    const warningsByRow = Map.groupBy(warnings, (warning) => warning.rowNumber);
    return (
        <div className="flex flex-col gap-3">
            <p
                aria-live="polite"
                className={cn(
                    'text-sm',
                    issueCount === 0 ? 'text-emerald-400' : 'text-amber-400',
                )}
            >
                {preview.rows.length} rows read;{' '}
                {rowsWithIssues === 0
                    ? 'every row is ready to import.'
                    : `${rowsWithIssues} with ${issueCount === 1 ? 'an issue' : `${issueCount} issues`} in total.`}
                {warningsByRow.size > 0 &&
                    ` ${warningsByRow.size} ready ${warningsByRow.size === 1 ? 'row has a warning' : 'rows have warnings'} worth checking before you import.`}
            </p>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Row</TableHead>
                        {shownColumns.map((column) => (
                            <TableHead className="font-mono" key={column}>
                                {column}
                            </TableHead>
                        ))}
                        <TableHead>Check</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {preview.rows.map((row) => (
                        <TableRow key={row.rowNumber}>
                            <TableCell className="align-top tabular-nums">
                                {row.rowNumber}
                            </TableCell>
                            {shownColumns.map((column) => (
                                <TableCell
                                    className="max-w-48 truncate align-top"
                                    key={column}
                                >
                                    {row.cells.get(column) ?? ''}
                                </TableCell>
                            ))}
                            <TableCell className="align-top">
                                {row.issues.length === 0 ? (
                                    <div className="flex flex-col gap-1">
                                        <span className="flex items-center gap-1 text-emerald-400">
                                            <CircleCheck className="size-4" />
                                            Ready
                                        </span>
                                        <RowWarnings
                                            warnings={
                                                warningsByRow.get(
                                                    row.rowNumber,
                                                ) ?? NO_CSV_WARNINGS
                                            }
                                        />
                                    </div>
                                ) : (
                                    <ul className="flex flex-col gap-1 text-amber-400">
                                        {row.issues.map((issue, index) => (
                                            <li key={index}>
                                                {describeIssue(issue)}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function RowWarnings({ warnings }: { warnings: readonly CsvIssue[] }) {
    if (warnings.length === 0) return null;
    return (
        <ul className="flex flex-col gap-1 text-amber-400">
            {warnings.map((warning, index) => (
                <li key={index}>Check {describeIssue(warning)}</li>
            ))}
        </ul>
    );
}

function SnapshotImport({
    accounts,
}: {
    accounts: readonly SnapshotCsvAccount[];
}) {
    const { clearCommitted, markCommitted, setText, text } = useImportText();
    const deferredText = useDeferredValue(text);
    const utilities = api.useUtils();
    const storedQuery = api.propAccounts.snapshot.latestForAll.useQuery();
    const stored = storedQuery.data;
    const bulkCreate = api.propAccounts.snapshot.bulkCreate.useMutation({
        onSuccess: (created) => {
            toast.success(`Imported ${countOf(created.length, SNAPSHOT_NOUN)}`);
            clearCommitted();
            return utilities.propAccounts.invalidate();
        },
    });
    const preview = useMemo(
        () =>
            stored === undefined || deferredText.trim() === ''
                ? null
                : previewSnapshotCsv(deferredText, accounts, stored),
        [deferredText, accounts, stored],
    );
    const warnings = useMemo(
        () =>
            preview === null
                ? NO_CSV_WARNINGS
                : snapshotCsvWarnings(preview, accounts),
        [preview, accounts],
    );

    if (stored === undefined) {
        return storedQuery.isError ? (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>
                    The stored snapshots could not be loaded
                </AlertTitle>
                <AlertDescription>
                    {storedQuery.error.message} Snapshot import needs them to
                    avoid saving a second snapshot for the same account and
                    date, so it is paused.
                </AlertDescription>
            </Alert>
        ) : (
            <Skeleton className="h-64 w-full" />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>What the preview checks</AlertTitle>
                <AlertDescription>
                    Each row is checked for format, ranges, duplicates within
                    the file, a clash with the latest stored snapshot of its
                    account, and whether its balances fit the plan, stage and
                    dashboard convention of the account, as the account form
                    checks them. A balance far above the account size is only a
                    warning and does not stop the import. The preview takes the
                    stage on each date from the purchase and funded dates only,
                    while the import itself uses the recorded lifecycle events,
                    so near a recorded pass or move live the two can disagree:
                    the preview can refuse a row the import would accept, or the
                    reverse. The import also checks the fields each plan needs
                    in that stage and a clash with an older stored snapshot, and
                    saves nothing if one row fails.
                </AlertDescription>
            </Alert>
            <CsvImportPanel
                columns={SNAPSHOT_CSV_COLUMNS}
                commitError={bulkCreate.error?.message ?? null}
                describeColumn={(column) => SNAPSHOT_COLUMN_HINTS[column]}
                isCommitting={bulkCreate.isPending}
                kind={ImportKind.Snapshots}
                noun={SNAPSHOT_NOUN}
                onCommit={(values) => {
                    markCommitted();
                    bulkCreate.mutate([...values]);
                }}
                onTextChange={(next) => {
                    setText(next);
                    if (!bulkCreate.isPending) bulkCreate.reset();
                }}
                preview={preview}
                previewIsCurrent={deferredText === text}
                required={REQUIRED_SNAPSHOT_CSV_COLUMNS}
                shownColumns={SNAPSHOT_SHOWN_COLUMNS}
                text={text}
                warnings={warnings}
            />
        </div>
    );
}

function useImportText(): ImportText {
    const [text, setText] = useState('');
    const committedText = useRef<null | string>(null);
    return {
        clearCommitted: () => {
            const committed = committedText.current;
            committedText.current = null;
            setText((current) => (current === committed ? '' : current));
        },
        markCommitted: () => {
            committedText.current = text;
        },
        setText,
        text,
    };
}
