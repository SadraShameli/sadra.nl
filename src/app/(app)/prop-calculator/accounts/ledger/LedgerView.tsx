'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Receipt, Wallet } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    AddRecordButton,
    ListQueryStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/DetailParts';
import {
    nullIfBlank,
    parsedOrIssues,
    UNSET_SELECT_VALUE,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/formParsing';
import { useRecordDialog } from '~/app/(app)/prop-calculator/accounts/_components/detail/useRecordDialog';
import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { GrossOnlyPayoutsNote } from '~/app/(app)/prop-calculator/accounts/_components/GrossOnlyPayoutsNote';
import {
    feeKindLabel,
    LEDGER_LIST_INPUT,
    payoutStatusLabel,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import {
    firmColumnsFromSelectValue,
    firmSelectOptions,
} from '~/app/(app)/prop-calculator/accounts/rounds/roundsModel';
import { DetailList } from '~/components/DetailList';
import { FilterToolbar } from '~/components/FilterToolbar';
import { FormDialog } from '~/components/FormDialog';
import { PanelSubheading } from '~/components/PanelSubheading';
import {
    deleteRowAction,
    editRowAction,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { StatStrip, StatTone } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { FilterIsoDateRange } from '~/components/ui/filter-iso-date-range';
import { FilterSelect } from '~/components/ui/filter-select';
import InfoPopover from '~/components/ui/info-popover';
import { Input } from '~/components/ui/input';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Skeleton } from '~/components/ui/skeleton';
import { useSession } from '~/lib/auth/client';
import { formatDisplayDate, NOT_APPLICABLE } from '~/lib/format';
import {
    BankrollTransferKind,
    bankrollTransferKindLabel,
    compareText,
    EntryTextKind,
    type ExternalFirmName,
    firmColumnsOf,
    firmKeyId,
    firmKeyLabel,
    firmKeyOf,
    firmReconciliation,
    type FirmReconciliationEntry,
    formatUsdCents,
    parseMoneyText,
    payoutLag,
    type PayoutLag,
    PortfolioLedger,
    ReportedPayoutBasis,
    reportedPayoutBasisLabel,
    type SampledEstimate,
    summarizeCash,
    todayIsoDate,
    usdCents,
    usdCentsToText,
} from '~/lib/prop-accounts';
import {
    buildLedgerEntries,
    BYTE_ORDER_MARK,
    DEFAULT_LEDGER_FILTERS,
    filterLedgerEntries,
    type LedgerAccount,
    ledgerAccountName,
    LedgerCashFlow,
    ledgerCashFlow,
    ledgerCsv,
    ledgerCsvFileName,
    type LedgerEntry,
    LedgerEntryFilter,
    ledgerEntryId,
    LedgerEntryKind,
    type LedgerFilters,
} from '~/lib/prop-accounts/csv';
import {
    bankrollTransferCreateSchema,
    firmStatementCreateSchema,
    firmStatementUpdateSchema,
} from '~/lib/schemas/propAccounts';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

enum LedgerColumn {
    Account = 'account',
    Amount = 'amount',
    ApprovedOn = 'approved-on',
    CashFlow = 'cash-flow',
    Date = 'date',
    Entry = 'entry',
    Note = 'note',
}

enum PayoutLagColumn {
    Firm = 'firm',
    RequestToApproval = 'request-to-approval',
    RequestToPaid = 'request-to-paid',
}

enum ReconciliationColumn {
    AsOf = 'as-of',
    Basis = 'basis',
    Difference = 'difference',
    Firm = 'firm',
    Reported = 'reported',
    YourLedger = 'your-ledger',
}

enum TransferColumn {
    Amount = 'amount',
    Date = 'date',
    Kind = 'kind',
    Note = 'note',
}

const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

const CASH_FLOW_LABEL: Readonly<Record<LedgerCashFlow, string>> = {
    [LedgerCashFlow.In]: 'In',
    [LedgerCashFlow.None]: 'None yet',
    [LedgerCashFlow.Out]: 'Out',
};

const ENTRY_FILTER_LABEL: Readonly<Record<LedgerEntryFilter, string>> = {
    [LedgerEntryFilter.All]: 'Payouts and fees',
    [LedgerEntryFilter.Fees]: 'Fees only',
    [LedgerEntryFilter.Payouts]: 'Payouts only',
};

const ENTRY_FILTERS: ReadonlyMap<string, LedgerEntryFilter> = new Map(
    Object.values(LedgerEntryFilter).map((member) => [member, member]),
);

interface AccountFilterOption {
    readonly label: string;
    readonly value: string;
}

interface PayoutLagRow {
    readonly firm: string;
    readonly hasEstimate: boolean;
    readonly key: string;
    readonly requestToApproval: string;
    readonly requestToPaid: string;
}

export function LedgerView() {
    const session = useSession();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const externalFirms = externalFirmsQuery.data;
    const [filters, setFilters] = useState<LedgerFilters>(
        DEFAULT_LEDGER_FILTERS,
    );

    const accounts = accountsQuery.data;
    const payouts = payoutsQuery.data;
    const fees = feesQuery.data;
    const userId = session.data?.user.id;
    const payoutLagRows = useMemo(
        () =>
            userId === undefined ||
            accounts === undefined ||
            payouts === undefined ||
            externalFirms === undefined
                ? []
                : payoutLagRowsOf(
                      payoutLag(
                          PortfolioLedger.fromRows(userId, {
                              accounts,
                              events: [],
                              fees: [],
                              payouts,
                          }),
                      ),
                      externalFirms,
                  ),
        [accounts, externalFirms, payouts, userId],
    );
    const entries = useMemo(
        () =>
            accounts === undefined ||
            payouts === undefined ||
            fees === undefined
                ? []
                : buildLedgerEntries(accounts, payouts, fees),
        [accounts, payouts, fees],
    );
    const visible = useMemo(
        () => filterLedgerEntries(entries, filters),
        [entries, filters],
    );
    const accountOptions = useMemo(
        () => accountFilterOptions(accounts ?? []),
        [accounts],
    );

    function payoutLagSection() {
        const failure =
            session.error?.message ?? externalFirmsQuery.error?.message;
        if (failure !== undefined) {
            return (
                <QueryErrorNotice
                    message={failure}
                    title="The payout lag could not be loaded"
                />
            );
        }
        if (externalFirms === undefined || session.isPending) {
            return (
                <Skeleton
                    aria-label="Loading payout lag"
                    className="h-24 w-full"
                    role="status"
                />
            );
        }
        if (userId === undefined) {
            return (
                <QueryErrorNotice
                    message="Your session could not be read."
                    title="The payout lag could not be loaded"
                />
            );
        }
        return <PayoutLagCard rows={payoutLagRows} />;
    }

    function payoutsAndFeesBody() {
        const failed = [accountsQuery, payoutsQuery, feesQuery].find(
            (query) => query.isError,
        );
        if (failed?.error) {
            return (
                <QueryErrorNotice
                    message={failed.error.message}
                    title="The ledger could not be loaded"
                />
            );
        }
        if (
            accountsQuery.isPending ||
            payoutsQuery.isPending ||
            feesQuery.isPending
        ) {
            return (
                <Skeleton
                    aria-label="Loading your payouts and fees"
                    className="h-64 w-full"
                    role="status"
                />
            );
        }
        if (entries.length === 0) {
            return (
                <EmptyState
                    description="Payouts and fees you record on your accounts show up here."
                    icon={Receipt}
                    title="No payouts or fees yet"
                />
            );
        }

        return (
            <>
                <LedgerFilterBar
                    accountOptions={accountOptions}
                    filters={filters}
                    onChange={setFilters}
                >
                    <Button
                        disabled={
                            visible.length === 0 || externalFirms === undefined
                        }
                        onClick={() => {
                            if (externalFirms === undefined) return;
                            const today = todayIsoDate(new Date());
                            downloadCsv(
                                ledgerCsv(visible, externalFirms),
                                ledgerCsvFileName(today),
                            );
                        }}
                        type="button"
                        variant="outline"
                    >
                        <Download />
                        Export {visible.length}{' '}
                        {visible.length === 1 ? 'row' : 'rows'} as CSV
                    </Button>
                    <InfoPopover title="CSV export">
                        Amounts are exact decimal dollars; refunds carry the
                        kind refund and cash flow in. Cells that a spreadsheet
                        could run as a formula start with an apostrophe.
                    </InfoPopover>
                </LedgerFilterBar>
                {externalFirmsQuery.isError && externalFirms === undefined && (
                    <p className="text-xs text-destructive">
                        Your firms could not be loaded, so the export is paused
                        until they load: {externalFirmsQuery.error.message}
                    </p>
                )}
                <LedgerTotals entries={visible} />
                {visible.length === 0 ? (
                    <EmptyState
                        description="No payout or fee matches these filters."
                        title="Nothing to show"
                    />
                ) : (
                    <LedgerTable entries={visible} />
                )}
                {payoutLagSection()}
            </>
        );
    }

    return (
        <div className="flex flex-col gap-10">
            <section
                aria-labelledby="prop-ledger-heading"
                className="app-prop-accounts__ledger-list"
            >
                <ToolPanel
                    contentClassName="gap-4"
                    title="Payouts and fees"
                    titleId="prop-ledger-heading"
                >
                    {payoutsAndFeesBody()}
                </ToolPanel>
            </section>
            <DepositsWithdrawalsSection />
            <FirmReconciliationSection externalFirms={externalFirms ?? []} />
        </div>
    );
}

function accountFilterOptions(
    accounts: readonly LedgerAccount[],
): readonly AccountFilterOption[] {
    return accounts
        .map((account) => ({
            label: ledgerAccountName(account),
            value: account.id,
        }))
        .toSorted((first, second) => compareText(first.label, second.label));
}

function DepositsWithdrawalsSection() {
    const utilities = api.useUtils();
    const transfersQuery = api.propAccounts.bankroll.list.useQuery();
    const dialog = useRecordDialog<TransferRow>();
    const remove = api.propAccounts.bankroll.remove.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
        onSuccess: () => {
            toast.success('Transfer deleted');
            return utilities.propAccounts.invalidate();
        },
    });
    const rows = transfersQuery.data;
    return (
        <section aria-labelledby="prop-bankroll-heading">
            <ToolPanel
                contentClassName="gap-4"
                title="Deposits and withdrawals"
                titleId="prop-bankroll-heading"
            >
                <ListQueryStatus
                    query={transfersQuery}
                    subject="deposits and withdrawals"
                />
                {rows?.length === 0 && (
                    <EmptyState
                        icon={Wallet}
                        size={EmptyStateSize.Compact}
                        title="No deposits or withdrawals recorded yet"
                    />
                )}
                {rows !== undefined && rows.length > 0 && (
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: row } }) => (
                                    <div className="tabular-nums">
                                        {formatDisplayDate(row.occurredOn)}
                                    </div>
                                ),
                                header: 'Date',
                                id: TransferColumn.Date,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <>{bankrollTransferKindLabel(row.kind)}</>
                                ),
                                header: 'Kind',
                                id: TransferColumn.Kind,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <>{formatUsdCents(row.amountCents)}</>
                                ),
                                header: 'Amount',
                                id: TransferColumn.Amount,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <div className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                        {row.note ?? ''}
                                    </div>
                                ),
                                header: 'Note',
                                id: TransferColumn.Note,
                            },
                            rowActionsColumn<TransferRow>({
                                actionsOf: (row) => [
                                    editRowAction(() => {
                                        dialog.startEditing(row);
                                    }),
                                    deleteRowAction({
                                        description:
                                            'This permanently removes the transfer from your bankroll.',
                                        onDelete: () => {
                                            remove.mutate({ id: row.id });
                                        },
                                        title: 'Delete this transfer?',
                                    }),
                                ],
                                isPendingOf: (row) =>
                                    remove.isPending &&
                                    remove.variables.id === row.id,
                                labelOf: (row) =>
                                    `the ${bankrollTransferKindLabel(row.kind)} on ${formatDisplayDate(row.occurredOn)}`,
                            }),
                        ]}
                        data={[...rows]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.id}
                    />
                )}
                <AddRecordButton
                    label="Add transfer"
                    onAdd={dialog.startAdding}
                />
                <Dialog onOpenChange={dialog.onOpenChange} open={dialog.isOpen}>
                    {dialog.isOpen && (
                        <TransferForm
                            editing={dialog.editing}
                            onDone={dialog.close}
                        />
                    )}
                </Dialog>
            </ToolPanel>
        </section>
    );
}

function describeEntry(entry: LedgerEntry): string {
    switch (entry.kind) {
        case LedgerEntryKind.Fee: {
            return feeKindLabel(entry.fee.kind);
        }
        case LedgerEntryKind.Payout: {
            return payoutStatusLabel(entry.payout.status);
        }
    }
}

function downloadCsv(text: string, fileName: string): void {
    const blob = new Blob([BYTE_ORDER_MARK, text], { type: CSV_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 0);
}

function editingStatementValues(row: StatementRow): StatementFormValues {
    return {
        asOf: row.asOf,
        basis: row.basis,
        firmValue: '',
        note: row.note ?? '',
        reportedPayoutCents: usdCentsToText(row.reportedPayoutCents),
    };
}

function emptyStatementValues(): StatementFormValues {
    return {
        asOf: todayIsoDate(new Date()),
        basis: UNSET_SELECT_VALUE,
        firmValue: '',
        note: '',
        reportedPayoutCents: '',
    };
}

function emptyTransferValues(): TransferFormValues {
    return {
        amountCents: '',
        kind: BankrollTransferKind.Deposit,
        note: '',
        occurredOn: todayIsoDate(new Date()),
    };
}

function EntryAmount({ entry }: { entry: LedgerEntry }) {
    switch (entry.kind) {
        case LedgerEntryKind.Fee: {
            return <>{formatUsdCents(entry.fee.amountCents)}</>;
        }
        case LedgerEntryKind.Payout: {
            const { grossCents, netCents } = entry.payout;
            return (
                <>
                    <div>{formatUsdCents(grossCents)} gross</div>
                    <div className="text-xs text-muted-foreground">
                        {netCents === null
                            ? 'net not entered'
                            : `${formatUsdCents(netCents)} received`}
                    </div>
                </>
            );
        }
    }
}

function FirmReconciliationSection({
    externalFirms,
}: {
    readonly externalFirms: readonly ExternalFirmName[];
}) {
    const session = useSession();
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const statementsQuery = api.propAccounts.firmStatement.list.useQuery();
    const utilities = api.useUtils();
    const dialog = useRecordDialog<StatementRow>();
    const remove = api.propAccounts.firmStatement.remove.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
        onSuccess: () => {
            toast.success('Statement deleted');
            return utilities.propAccounts.invalidate();
        },
    });
    const statementById = new Map(
        (statementsQuery.data ?? []).map((row) => [row.id, row]),
    );

    const entries = useMemo(() => {
        const userId = session.data?.user.id;
        if (
            userId === undefined ||
            accountsQuery.data === undefined ||
            payoutsQuery.data === undefined ||
            statementsQuery.data === undefined
        ) {
            return null;
        }
        const ledger = PortfolioLedger.fromRows(userId, {
            accounts: accountsQuery.data,
            events: [],
            fees: [],
            firmStatements: statementsQuery.data,
            payouts: payoutsQuery.data,
        });
        return firmReconciliation(ledger);
    }, [
        accountsQuery.data,
        payoutsQuery.data,
        session.data?.user.id,
        statementsQuery.data,
    ]);

    return (
        <section aria-labelledby="prop-reconciliation-heading">
            <ToolPanel
                contentClassName="gap-4"
                title="Firm-reported total reconciliation"
                titleId="prop-reconciliation-heading"
            >
                <ListQueryStatus query={accountsQuery} subject="accounts" />
                <ListQueryStatus query={payoutsQuery} subject="payouts" />
                <ListQueryStatus
                    query={statementsQuery}
                    subject="firm statements"
                />
                {entries !== null && entries.length > 0 && (
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: entry } }) =>
                                    firmKeyLabel(entry.firmKey, externalFirms),
                                header: 'Firm',
                                id: ReconciliationColumn.Firm,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row: { original: entry } }) => (
                                    <span className="tabular-nums">
                                        {formatDisplayDate(entry.asOf)}
                                    </span>
                                ),
                                header: 'As of',
                                id: ReconciliationColumn.AsOf,
                            },
                            {
                                cell: ({ row: { original: entry } }) =>
                                    reportedPayoutBasisLabel(entry.basis),
                                header: 'Basis',
                                id: ReconciliationColumn.Basis,
                            },
                            {
                                cell: ({ row: { original: entry } }) => (
                                    <>
                                        {formatUsdCents(
                                            entry.reportedPayoutCents,
                                        )}
                                        {entry.decreasedFromPrevious && (
                                            <div className="text-xs text-warning">
                                                Down from the previous statement
                                            </div>
                                        )}
                                    </>
                                ),
                                header: 'Reported',
                                id: ReconciliationColumn.Reported,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: entry } }) => (
                                    <>
                                        {formatUsdCents(entry.ledgerPaidCents)}
                                        {entry.grossOnlyCount > 0 && (
                                            <div className="text-xs text-muted-foreground">
                                                {entry.grossOnlyCount} paid
                                                without a net amount
                                            </div>
                                        )}
                                    </>
                                ),
                                header: 'Your ledger',
                                id: ReconciliationColumn.YourLedger,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row: { original: entry } }) => (
                                    <div
                                        className={cn(
                                            !entry.withinTolerance &&
                                                'text-warning',
                                        )}
                                    >
                                        {formatUsdCents(
                                            usdCents(entry.differenceCents),
                                        )}
                                        {!entry.withinTolerance && (
                                            <div className="text-xs">
                                                Outside tolerance
                                            </div>
                                        )}
                                    </div>
                                ),
                                header: 'Difference',
                                id: ReconciliationColumn.Difference,
                                meta: { align: DataTableAlign.End },
                            },
                            rowActionsColumn<FirmReconciliationEntry>({
                                actionsOf: (entry) => {
                                    const stored = statementById.get(entry.id);
                                    return [
                                        ...(stored === undefined
                                            ? []
                                            : [
                                                  editRowAction(() => {
                                                      dialog.startEditing(
                                                          stored,
                                                      );
                                                  }),
                                              ]),
                                        deleteRowAction({
                                            description:
                                                'This permanently removes the statement.',
                                            onDelete: () => {
                                                remove.mutate({
                                                    id: entry.id,
                                                });
                                            },
                                            title: 'Delete this statement?',
                                        }),
                                    ];
                                },
                                isPendingOf: (entry) =>
                                    remove.isPending &&
                                    remove.variables.id === entry.id,
                                labelOf: (entry) =>
                                    `the statement as of ${formatDisplayDate(entry.asOf)}`,
                            }),
                        ]}
                        data={[...entries]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(entry) => entry.id}
                    />
                )}
                <AddRecordButton
                    label="Add statement"
                    onAdd={dialog.startAdding}
                />
                <Dialog onOpenChange={dialog.onOpenChange} open={dialog.isOpen}>
                    {dialog.isOpen && (
                        <StatementForm
                            editing={dialog.editing}
                            externalFirms={externalFirms}
                            onDone={dialog.close}
                        />
                    )}
                </Dialog>
            </ToolPanel>
        </section>
    );
}

function formatLagDays(estimate: null | SampledEstimate): string {
    if (estimate === null) return NOT_APPLICABLE;
    const sample =
        estimate.standardError === null
            ? `n = ${String(estimate.n)}`
            : `SE ${estimate.standardError.toFixed(1)}, n = ${String(estimate.n)}`;
    return `${estimate.value.toFixed(1)} days (${sample})`;
}

function LedgerFilterBar({
    accountOptions,
    children,
    filters,
    onChange,
}: {
    accountOptions: readonly AccountFilterOption[];
    children: ReactNode;
    filters: LedgerFilters;
    onChange: (next: LedgerFilters) => void;
}) {
    const isFiltered =
        filters.accountId !== DEFAULT_LEDGER_FILTERS.accountId ||
        filters.entries !== DEFAULT_LEDGER_FILTERS.entries ||
        filters.from !== DEFAULT_LEDGER_FILTERS.from ||
        filters.to !== DEFAULT_LEDGER_FILTERS.to;
    return (
        <FilterToolbar label="Ledger filters">
            <FilterSelect
                label="Account"
                onValueChange={(value) => {
                    onChange({ ...filters, accountId: value ?? null });
                }}
                options={accountOptions}
                placeholder="All accounts"
                value={filters.accountId ?? undefined}
            />
            <FilterSelect
                label="Entries"
                onValueChange={(value) => {
                    const entries =
                        value === undefined
                            ? LedgerEntryFilter.All
                            : ENTRY_FILTERS.get(value);
                    if (entries !== undefined) {
                        onChange({ ...filters, entries });
                    }
                }}
                options={Object.values(LedgerEntryFilter)
                    .filter((member) => member !== LedgerEntryFilter.All)
                    .map((member) => ({
                        label: ENTRY_FILTER_LABEL[member],
                        value: member,
                    }))}
                placeholder={ENTRY_FILTER_LABEL[LedgerEntryFilter.All]}
                value={
                    filters.entries === LedgerEntryFilter.All
                        ? undefined
                        : filters.entries
                }
            />
            <FilterIsoDateRange
                label="Entry date"
                onChange={(range) => {
                    onChange({ ...filters, from: range.from, to: range.to });
                }}
                placeholder="Any date"
                value={{ from: filters.from, to: filters.to }}
            />
            <ClearFiltersButton
                active={isFiltered}
                onReset={() => {
                    onChange(DEFAULT_LEDGER_FILTERS);
                }}
            />
            {children}
        </FilterToolbar>
    );
}

function LedgerTable({ entries }: { entries: readonly LedgerEntry[] }) {
    return (
        <DataTable
            columns={LEDGER_COLUMNS}
            data={[...entries]}
            isSortable={false}
            pageSize={null}
            rowId={(entry) => `${entry.kind}-${ledgerEntryId(entry)}`}
        />
    );
}

const LEDGER_COLUMNS: DataTableColumn<LedgerEntry>[] = [
    {
        cell: ({ row: { original: entry } }) => (
            <span className="tabular-nums">{formatDisplayDate(entry.on)}</span>
        ),
        header: 'Date',
        id: LedgerColumn.Date,
        meta: { isRowHeader: true },
    },
    {
        cell: ({ row: { original: entry } }) =>
            entry.account === null ? (
                <span className="text-muted-foreground">Deleted account</span>
            ) : (
                ledgerAccountName(entry.account)
            ),
        header: 'Account',
        id: LedgerColumn.Account,
    },
    {
        cell: ({ row: { original: entry } }) => describeEntry(entry),
        header: 'Entry',
        id: LedgerColumn.Entry,
    },
    {
        cell: ({ row: { original: entry } }) => <EntryAmount entry={entry} />,
        header: 'Amount',
        id: LedgerColumn.Amount,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: entry } }) => (
            <span className="tabular-nums">
                {entry.kind === LedgerEntryKind.Payout &&
                entry.payout.approvedOn !== null
                    ? formatDisplayDate(entry.payout.approvedOn)
                    : ''}
            </span>
        ),
        header: 'Approved on',
        id: LedgerColumn.ApprovedOn,
    },
    {
        cell: ({ row: { original: entry } }) => {
            const cashFlow = ledgerCashFlow(entry);
            return (
                <span
                    className={cn(
                        cashFlow === LedgerCashFlow.In && 'text-success',
                        cashFlow === LedgerCashFlow.Out && 'text-warning',
                        cashFlow === LedgerCashFlow.None &&
                            'text-muted-foreground',
                    )}
                >
                    {CASH_FLOW_LABEL[cashFlow]}
                </span>
            );
        },
        header: 'Cash flow',
        id: LedgerColumn.CashFlow,
    },
    {
        cell: ({ row: { original: entry } }) => (
            <div className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                {(entry.kind === LedgerEntryKind.Fee
                    ? entry.fee.note
                    : entry.payout.note) ?? ''}
            </div>
        ),
        header: 'Note',
        id: LedgerColumn.Note,
    },
];

function LedgerTotals({ entries }: { entries: readonly LedgerEntry[] }) {
    const cash = useMemo(
        () =>
            summarizeCash(
                entries.flatMap((entry) =>
                    entry.kind === LedgerEntryKind.Fee ? [entry.fee] : [],
                ),
                entries.flatMap((entry) =>
                    entry.kind === LedgerEntryKind.Payout ? [entry.payout] : [],
                ),
            ),
        [entries],
    );
    return (
        <div className="flex flex-col gap-2">
            <StatStrip
                items={[
                    {
                        id: 'payouts',
                        label: `Payouts received (${String(cash.paidPayouts)} paid)`,
                        value: formatUsdCents(cash.payouts),
                    },
                    {
                        id: 'spend',
                        label: `Spend after ${formatUsdCents(cash.refunds)} refunds`,
                        value: formatUsdCents(cash.spend),
                    },
                    {
                        id: 'net',
                        label: 'Net in these rows',
                        tone:
                            cash.net < 0 ? StatTone.Warning : StatTone.Positive,
                        value: formatUsdCents(cash.net),
                    },
                ]}
            />
            <GrossOnlyPayoutsNote count={cash.grossOnlyPayouts} />
        </div>
    );
}

function parsedReportedPayoutCents(
    text: string,
    context: z.RefinementCtx,
): null | number {
    const reported = parseMoneyText(text);
    if (reported.kind === EntryTextKind.Valid) return reported.cents;
    context.addIssue({
        code: 'custom',
        message:
            reported.kind === EntryTextKind.Invalid
                ? reported.message
                : 'Enter the reported total',
        path: ['reportedPayoutCents'],
    });
    return null;
}

function PayoutLagCard({ rows }: { readonly rows: readonly PayoutLagRow[] }) {
    if (rows.every((row) => !row.hasEstimate)) return null;
    return (
        <div className="flex flex-col gap-2">
            <PanelSubheading>Payout lag by firm</PanelSubheading>
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => <>{row.original.firm}</>,
                        header: 'Firm',
                        id: PayoutLagColumn.Firm,
                        meta: { isRowHeader: true },
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText
                                className="tabular-nums"
                                text={row.original.requestToApproval}
                            />
                        ),
                        header: 'Request to approval',
                        id: PayoutLagColumn.RequestToApproval,
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText
                                className="tabular-nums"
                                text={row.original.requestToPaid}
                            />
                        ),
                        header: 'Request to paid',
                        id: PayoutLagColumn.RequestToPaid,
                    },
                ]}
                data={[...rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
        </div>
    );
}

function payoutLagRowsOf(
    lag: PayoutLag,
    externalFirms: readonly ExternalFirmName[],
): readonly PayoutLagRow[] {
    return lag.perFirm.map((entry) => ({
        firm: firmKeyLabel(entry.firmKey, externalFirms),
        hasEstimate:
            entry.requestToApproval !== null || entry.requestToPaid !== null,
        key: firmKeyId(entry.firmKey),
        requestToApproval: formatLagDays(entry.requestToApproval),
        requestToPaid: formatLagDays(entry.requestToPaid),
    }));
}
function StatementForm({
    editing,
    externalFirms,
    onDone,
}: {
    readonly editing: null | StatementRow;
    readonly externalFirms: readonly ExternalFirmName[];
    readonly onDone: () => void;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.firmStatement.create.useMutation();
    const update = api.propAccounts.firmStatement.update.useMutation();
    const schema = statementFormSchema(editing?.id ?? null);
    const form = useForm<StatementFormValues>({
        defaultValues:
            editing === null
                ? emptyStatementValues()
                : editingStatementValues(editing),
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();

    const save = async (values: StatementFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        try {
            if ('id' in parsed.data) {
                await update.mutateAsync(parsed.data);
                toast.success('Statement saved');
            } else {
                await create.mutateAsync(parsed.data);
                toast.success('Statement recorded');
            }
            onDone();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not save',
            );
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <FormDialog
            form={form}
            onCancel={onDone}
            onSubmit={save}
            pending={create.isPending || update.isPending}
            submitLabel={editing === null ? 'Add statement' : 'Save statement'}
            title={
                editing === null
                    ? 'Add a firm statement'
                    : 'Edit firm statement'
            }
        >
            {editing === null ? (
                <Controller
                    control={form.control}
                    name="firmValue"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-firmValue`}>
                                Firm
                            </FieldLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <SelectTrigger
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-firmValue`}
                                    ref={field.ref}
                                >
                                    <SelectValue placeholder="Choose a firm">
                                        {
                                            firmSelectOptions(
                                                externalFirms,
                                            ).find(
                                                (option) =>
                                                    option.value ===
                                                    field.value,
                                            )?.label
                                        }
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {firmSelectOptions(externalFirms).map(
                                        (option) => (
                                            <SelectItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            ) : (
                <DetailList
                    items={[
                        {
                            id: 'firm',
                            label: 'Firm',
                            value: firmKeyLabel(
                                firmKeyOf(firmColumnsOf(editing)),
                                externalFirms,
                            ),
                        },
                    ]}
                />
            )}
            <Controller
                control={form.control}
                name="asOf"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-asOf`}>
                            As of
                        </FieldLabel>
                        <IsoDatePicker
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-asOf`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="basis"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-basis`}>
                            Basis
                        </FieldLabel>
                        <Select
                            onValueChange={(next) => {
                                const parsedBasis = z
                                    .enum(ReportedPayoutBasis)
                                    .safeParse(next).data;
                                if (parsedBasis !== undefined) {
                                    field.onChange(parsedBasis);
                                }
                            }}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-basis`}
                                ref={field.ref}
                            >
                                <SelectValue placeholder="Choose gross or net">
                                    {field.value === UNSET_SELECT_VALUE
                                        ? undefined
                                        : reportedPayoutBasisLabel(field.value)}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(ReportedPayoutBasis).map(
                                    (basis) => (
                                        <SelectItem key={basis} value={basis}>
                                            {reportedPayoutBasisLabel(basis)}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="reportedPayoutCents"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-reportedPayoutCents`}>
                            Reported total
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-reportedPayoutCents`}
                            inputMode="decimal"
                            placeholder="0.00"
                            {...field}
                        />
                        <FieldDescription>
                            The total your firm dashboard shows as of this date.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </FormDialog>
    );
}

function statementFormSchema(editingId: null | string) {
    return statementFormShape.transform((values, context) => {
        if (values.basis === UNSET_SELECT_VALUE) {
            context.addIssue({
                code: 'custom',
                message: 'Choose whether the reported total is gross or net',
                path: ['basis'],
            });
            return z.NEVER;
        }
        const reportedPayoutCents = parsedReportedPayoutCents(
            values.reportedPayoutCents,
            context,
        );
        if (reportedPayoutCents === null) return z.NEVER;
        if (editingId === null) {
            const firmColumns = firmColumnsFromSelectValue(values.firmValue);
            if (firmColumns === null) {
                context.addIssue({
                    code: 'custom',
                    message: 'Pick a firm',
                    path: ['firmValue'],
                });
                return z.NEVER;
            }
            const parsed = firmStatementCreateSchema.safeParse({
                ...firmColumns,
                asOf: values.asOf,
                basis: values.basis,
                note: nullIfBlank(values.note),
                reportedPayoutCents,
            });
            return parsedOrIssues(parsed, context);
        }
        const parsed = firmStatementUpdateSchema.safeParse({
            asOf: values.asOf,
            basis: values.basis,
            id: editingId,
            note: nullIfBlank(values.note),
            reportedPayoutCents,
        });
        return parsedOrIssues(parsed, context);
    });
}

const statementFormShape = z.object({
    asOf: z.string(),
    basis: z.union([
        z.enum(ReportedPayoutBasis),
        z.literal(UNSET_SELECT_VALUE),
    ]),
    firmValue: z.string(),
    note: z.string(),
    reportedPayoutCents: z.string(),
});

type StatementFormValues = z.input<typeof statementFormShape>;

type StatementRow =
    RouterOutputs['propAccounts']['firmStatement']['list'][number];

function TransferForm({
    editing,
    onDone,
}: {
    readonly editing: null | TransferRow;
    readonly onDone: () => void;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.bankroll.create.useMutation();
    const update = api.propAccounts.bankroll.update.useMutation();
    const schema = transferFormSchema();
    const form = useForm<TransferFormValues>({
        defaultValues:
            editing === null
                ? emptyTransferValues()
                : {
                      amountCents: usdCentsToText(editing.amountCents),
                      kind: editing.kind,
                      note: editing.note ?? '',
                      occurredOn: editing.occurredOn,
                  },
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();

    const save = async (values: TransferFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        const draft = parsed.data;
        try {
            if (editing === null) {
                await create.mutateAsync(draft);
                toast.success('Transfer recorded');
            } else {
                await update.mutateAsync({ ...draft, id: editing.id });
                toast.success('Transfer saved');
            }
            onDone();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not save',
            );
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <FormDialog
            form={form}
            onCancel={onDone}
            onSubmit={save}
            pending={create.isPending || update.isPending}
            submitLabel={editing === null ? 'Add transfer' : 'Save transfer'}
            title={editing === null ? 'Add a transfer' : 'Edit transfer'}
        >
            <Controller
                control={form.control}
                name="kind"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-kind`}>Kind</FieldLabel>
                        <Select
                            onValueChange={(next) => {
                                const parsedKind = z
                                    .enum(BankrollTransferKind)
                                    .safeParse(next).data;
                                if (parsedKind !== undefined) {
                                    field.onChange(parsedKind);
                                }
                            }}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-kind`}
                                ref={field.ref}
                            >
                                <SelectValue>
                                    {bankrollTransferKindLabel(field.value)}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(BankrollTransferKind).map(
                                    (kind) => (
                                        <SelectItem key={kind} value={kind}>
                                            {bankrollTransferKindLabel(kind)}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="amountCents"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-amountCents`}>
                            Amount
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-amountCents`}
                            inputMode="decimal"
                            placeholder="0.00"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="occurredOn"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-occurredOn`}>
                            Date
                        </FieldLabel>
                        <IsoDatePicker
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-occurredOn`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="note"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-note`}>
                            Note (optional)
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-note`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </FormDialog>
    );
}

function transferFormSchema() {
    return transferFormShape.transform((values, context) => {
        const amount = parseMoneyText(values.amountCents);
        if (amount.kind !== EntryTextKind.Valid) {
            context.addIssue({
                code: 'custom',
                message:
                    amount.kind === EntryTextKind.Invalid
                        ? amount.message
                        : 'Enter the amount',
                path: ['amountCents'],
            });
            return z.NEVER;
        }
        const parsed = bankrollTransferCreateSchema.safeParse({
            amountCents: amount.cents,
            kind: values.kind,
            note: nullIfBlank(values.note),
            occurredOn: values.occurredOn,
        });
        return parsedOrIssues(parsed, context);
    });
}

const transferFormShape = z.object({
    amountCents: z.string(),
    kind: z.enum(BankrollTransferKind),
    note: z.string(),
    occurredOn: z.string(),
});

type TransferFormValues = z.input<typeof transferFormShape>;

type TransferRow = RouterOutputs['propAccounts']['bankroll']['list'][number];
