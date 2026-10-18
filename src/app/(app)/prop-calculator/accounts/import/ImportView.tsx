'use client';

import { CircleCheck, FileUp } from 'lucide-react';
import {
    type ReactNode,
    useDeferredValue,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import { toast } from 'sonner';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    accountOptInOptions,
    accountPlanOptions,
    planTagLabel,
} from '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions';
import {
    ErrorNoticeTitle,
    QueryErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { messageWithConsequence } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { DetailList, DetailListLayout } from '~/components/DetailList';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import { FilePicker } from '~/components/ui/file-picker';
import InfoPopover from '~/components/ui/info-popover';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Textarea } from '~/components/ui/textarea';
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
import { api } from '~/trpc/react';

enum ImportKind {
    Accounts = 'accounts',
    Snapshots = 'snapshots',
}

enum ImportViewColumn {
    AccountSize = 'accountsize',
    Firm = 'firm',
    OfferedOptIns = 'offered-opt-ins',
    Plan = 'plan',
    PlanSerial = 'plan-serial',
}

enum PreviewColumn {
    Check = 'check',
    Row = 'row',
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
    readonly reference?: ReactNode;
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
    [AccountCsvColumn.Round]:
        'The label of one of your open rounds; leave empty for none.',
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
            <QueryErrorNotice
                consequence="Import needs them to check labels, so it is paused."
                message={accountsQuery.error.message}
                title={ErrorNoticeTitle.Accounts}
            />
        ) : (
            <Skeleton
                aria-label="Loading your accounts"
                className="h-64 w-full"
                role="status"
            />
        );
    }

    return (
        <Tabs
            className="flex flex-col gap-6"
            defaultValue={ImportKind.Accounts}
        >
            {accountsQuery.isError && (
                <StatusRow
                    detail={messageWithConsequence(
                        accountsQuery.error.message,
                        'Labels are checked against the list loaded earlier, which may be out of date. Reload the page before importing if you changed an account since then.',
                    )}
                    title="The account list could not be refreshed"
                    tone={StatusTone.Warn}
                />
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
                reference={<PlanReference />}
                required={REQUIRED_ACCOUNT_CSV_COLUMNS}
                shownColumns={ACCOUNT_SHOWN_COLUMNS}
                text={text}
                warnings={NO_CSV_WARNINGS}
            />
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
        <QueryErrorNotice
            consequence="Account import needs them to check firm names, so it is paused."
            message={externalFirmsQuery.error.message}
            title={ErrorNoticeTitle.Firms}
        />
    ) : (
        <Skeleton
            aria-label="Loading your firms"
            className="h-64 w-full"
            role="status"
        />
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
        <DetailList
            className="max-h-96 overflow-y-auto"
            items={columns.map((column) => ({
                id: column,
                label: column,
                value: (
                    <>
                        {required.includes(column) && (
                            <Badge className="mr-2">required</Badge>
                        )}
                        {describeColumn(column)}
                    </>
                ),
            }))}
            label="Columns and formats"
            layout={DetailListLayout.Stacked}
        />
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
    reference,
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

    const readFile = async (file: File) => {
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
            className={`app-prop-accounts__import-${kind}`}
        >
            <ToolPanel
                actions={reference}
                contentClassName="gap-4"
                info={
                    <ColumnReference
                        columns={columns}
                        describeColumn={describeColumn}
                        required={required}
                    />
                }
                title={`Import ${noun.plural}`}
                titleId={`${baseId}-heading`}
            >
                <Field>
                    <FieldLabel htmlFor={textId}>CSV text</FieldLabel>
                    <Textarea
                        aria-describedby={`${textId}-hint`}
                        className="min-h-48 font-mono text-xs"
                        disabled={isCommitting}
                        id={textId}
                        onChange={(event) => {
                            setFileError(null);
                            onTextChange(event.target.value);
                        }}
                        placeholder={`Paste the ${noun.plural} CSV here, header row first`}
                        spellCheck={false}
                        value={text}
                    />
                    <FieldDescription id={`${textId}-hint`}>
                        Comma or tab separated, with the header row first. At
                        most {MAX_IMPORT_ROWS} rows and 256 KB. Row numbers
                        below count the header as row 1.
                    </FieldDescription>
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                    <FieldLabel className="sr-only" htmlFor={fileId}>
                        Upload a CSV file of {noun.plural}
                    </FieldLabel>
                    <FilePicker
                        accept=".csv,.tsv,.txt,text/csv,text/plain"
                        buttonLabel="Choose CSV"
                        disabled={isCommitting}
                        fileName={text === '' ? null : 'File loaded'}
                        id={fileId}
                        onFile={(file) => {
                            void readFile(file);
                        }}
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
                    <QueryErrorNotice
                        message={fileError}
                        title="The file was not loaded"
                    />
                )}
                {preview !== null && preview.kind === CsvTableKind.Failed && (
                    <QueryErrorNotice
                        message={describeCsvFailure(preview.failure)}
                        title="This CSV cannot be imported"
                    />
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
                    <QueryErrorNotice
                        message={commitError}
                        title="Nothing was imported"
                    />
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
                            Fix every issue first; an import saves all rows or
                            none.
                        </p>
                    )}
                </div>
            </ToolPanel>
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
        <Dialog>
            <DialogTrigger asChild>
                <Button size="sm" type="button" variant="outline">
                    Plan serials
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Plan serials for the plan column</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh]">
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => (
                                    <span className="font-mono text-xs">
                                        {row.original.firmId}
                                    </span>
                                ),
                                header: 'firm',
                                id: ImportViewColumn.Firm,
                            },
                            {
                                cell: ({ row }) => (
                                    <span className="font-mono text-xs">
                                        {row.original.planSerial}
                                    </span>
                                ),
                                header: 'plan',
                                id: ImportViewColumn.PlanSerial,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row }) => (
                                    <span className="tabular-nums">
                                        {row.original.size}
                                    </span>
                                ),
                                header: 'accountSize',
                                id: ImportViewColumn.AccountSize,
                            },
                            {
                                cell: ({ row }) => (
                                    <>
                                        {row.original.label}
                                        {row.original.tags !== '' && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                ({row.original.tags})
                                            </span>
                                        )}
                                    </>
                                ),
                                header: 'Plan',
                                id: ImportViewColumn.Plan,
                            },
                            {
                                cell: ({ row }) => (
                                    <span className="text-muted-foreground">
                                        {row.original.optIns === ''
                                            ? 'None'
                                            : row.original.optIns}
                                    </span>
                                ),
                                header: 'Offered opt-ins',
                                id: ImportViewColumn.OfferedOptIns,
                            },
                        ]}
                        data={[...rows]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.planSerial}
                    />
                </ScrollArea>
            </DialogContent>
        </Dialog>
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
    type PreviewRow = (typeof preview.rows)[number];
    return (
        <div className="flex flex-col gap-3">
            <StatusRow
                title={`${String(preview.rows.length)} rows read; ${rowsWithIssues === 0 ? 'every row is ready to import.' : `${String(rowsWithIssues)} with ${issueCount === 1 ? 'an issue' : `${String(issueCount)} issues`} in total.`}${warningsByRow.size > 0 ? ` ${String(warningsByRow.size)} ready ${warningsByRow.size === 1 ? 'row has a warning' : 'rows have warnings'} worth checking before you import.` : ''}`}
                tone={issueCount === 0 ? StatusTone.Pass : StatusTone.Warn}
            />
            <DataTable
                columns={[
                    {
                        cell: ({ row: { original: row } }) => (
                            <span className="tabular-nums">
                                {row.rowNumber}
                            </span>
                        ),
                        header: 'Row',
                        id: PreviewColumn.Row,
                        meta: { isRowHeader: true },
                    },
                    ...shownColumns.map(
                        (column): DataTableColumn<PreviewRow> => ({
                            cell: ({ row: { original: row } }) => (
                                <div className="max-w-48 truncate">
                                    {row.cells.get(column) ?? ''}
                                </div>
                            ),
                            header: column,
                            id: column,
                        }),
                    ),
                    {
                        cell: ({ row: { original: row } }) =>
                            row.issues.length === 0 ? (
                                <div className="flex flex-col gap-1">
                                    <span className="flex items-center gap-1">
                                        <CircleCheck
                                            aria-hidden
                                            className="size-4"
                                        />
                                        Ready
                                    </span>
                                    <RowWarnings
                                        warnings={
                                            warningsByRow.get(row.rowNumber) ??
                                            NO_CSV_WARNINGS
                                        }
                                    />
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-1">
                                    {row.issues.map((issue, index) => (
                                        <li key={index}>
                                            {describeIssue(issue)}
                                        </li>
                                    ))}
                                </ul>
                            ),
                        header: 'Check',
                        id: PreviewColumn.Check,
                    },
                ]}
                data={[...preview.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => String(row.rowNumber)}
            />
        </div>
    );
}

function RowWarnings({ warnings }: { warnings: readonly CsvIssue[] }) {
    if (warnings.length === 0) return null;
    return (
        <ul className="flex flex-col gap-1">
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
            <QueryErrorNotice
                consequence="Snapshot import needs them to avoid saving a second snapshot for the same account and date, so it is paused."
                message={storedQuery.error.message}
                title="The stored snapshots could not be loaded"
            />
        ) : (
            <Skeleton
                aria-label="Loading your latest snapshots"
                className="h-64 w-full"
                role="status"
            />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                The import saves nothing if a single row fails.
                <InfoPopover title="What the preview checks">
                    <p>
                        Each row is checked for format, ranges, duplicates
                        within the file, a clash with the latest stored snapshot
                        of its account, and whether its balances fit the plan,
                        stage and dashboard convention of the account, as the
                        account form checks them. A balance far above the
                        account size is only a warning.
                    </p>
                    <p>
                        The preview takes the stage on each date from the
                        purchase and funded dates only, while the import uses
                        the recorded lifecycle events, so near a recorded pass
                        or move live the two can disagree.
                    </p>
                    <p>
                        The import also checks the fields each plan needs in
                        that stage and a clash with an older stored snapshot.
                    </p>
                </InfoPopover>
            </div>
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
