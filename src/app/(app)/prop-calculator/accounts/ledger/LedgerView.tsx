'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Pencil, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    ListQueryStatus,
    RemoveRecordDialog,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/DetailParts';
import {
    nullIfBlank,
    parsedOrIssues,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/formParsing';
import { useRowEditing } from '~/app/(app)/prop-calculator/accounts/_components/detail/useRowEditing';
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
import { Button } from '~/components/ui/Button';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { useSession } from '~/lib/auth/client';
import { NOT_APPLICABLE } from '~/lib/format';
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

const ALL = 'all';
const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const UNSET_BASIS = '';

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

    function payoutsAndFeesSection() {
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
            return <Skeleton className="h-64 w-full" />;
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
            <section
                aria-labelledby="prop-ledger-heading"
                className="app-prop-accounts__ledger-list flex flex-col gap-4"
            >
                <h2 className="sr-only" id="prop-ledger-heading">
                    Payouts and fees
                </h2>
                <LedgerFilterBar
                    accountOptions={accountOptions}
                    filters={filters}
                    onChange={setFilters}
                />
                <LedgerTotals entries={visible} />
                <div className="flex flex-wrap items-center gap-3">
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
                    {externalFirmsQuery.isError &&
                        externalFirms === undefined && (
                            <p className="text-xs text-destructive">
                                Your firms could not be loaded, so the export is
                                paused until they load:{' '}
                                {externalFirmsQuery.error.message}
                            </p>
                        )}
                    <p className="text-xs text-muted-foreground">
                        Amounts are exact decimal dollars; refunds carry the
                        kind refund and cash flow in. Cells that a spreadsheet
                        could run as a formula start with an apostrophe.
                    </p>
                </div>
                {visible.length === 0 ? (
                    <EmptyState
                        description="No payout or fee matches these filters."
                        title="Nothing to show"
                    />
                ) : (
                    <LedgerTable entries={visible} />
                )}
                {payoutLagSection()}
            </section>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            <DepositsWithdrawalsSection />
            <FirmReconciliationSection externalFirms={externalFirms ?? []} />
            {payoutsAndFeesSection()}
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
    const { editing, startEditing, stopEditing } = useRowEditing<TransferRow>();
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
        <section
            aria-labelledby="prop-bankroll-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="prop-bankroll-heading"
            >
                Deposits and withdrawals
            </h2>
            <ListQueryStatus
                query={transfersQuery}
                subject="deposits and withdrawals"
            />
            {rows?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No deposits or withdrawals recorded yet.
                </p>
            )}
            {rows !== undefined && rows.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Kind</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead>
                                <span className="sr-only">Actions</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell className="tabular-nums">
                                    {row.occurredOn}
                                </TableCell>
                                <TableCell>
                                    {bankrollTransferKindLabel(row.kind)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatUsdCents(row.amountCents)}
                                </TableCell>
                                <TableCell className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                    {row.note ?? ''}
                                </TableCell>
                                <TableCell>
                                    <div className="flex justify-end gap-1">
                                        <Button
                                            aria-label={`Edit the ${bankrollTransferKindLabel(row.kind)} on ${row.occurredOn}`}
                                            onClick={(event) => {
                                                startEditing(
                                                    row,
                                                    event.currentTarget,
                                                );
                                            }}
                                            size="icon"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <Pencil />
                                        </Button>
                                        <RemoveRecordDialog
                                            confirmText="Delete"
                                            description="This permanently removes the transfer from your bankroll."
                                            isPending={remove.isPending}
                                            onConfirm={() => {
                                                remove.mutate({
                                                    id: row.id,
                                                });
                                            }}
                                            title="Delete this transfer?"
                                            triggerLabel={`Delete the ${bankrollTransferKindLabel(row.kind)} on ${row.occurredOn}`}
                                        />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <TransferForm
                editing={editing}
                key={editing?.id ?? 'new'}
                onDone={stopEditing}
            />
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
        basis: UNSET_BASIS,
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
    const { editing, startEditing, stopEditing } =
        useRowEditing<StatementRow>();
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
        <section
            aria-labelledby="prop-reconciliation-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="prop-reconciliation-heading"
            >
                Firm-reported total reconciliation
            </h2>
            <ListQueryStatus query={accountsQuery} subject="accounts" />
            <ListQueryStatus query={payoutsQuery} subject="payouts" />
            <ListQueryStatus
                query={statementsQuery}
                subject="firm statements"
            />
            {entries !== null && entries.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Firm</TableHead>
                            <TableHead>As of</TableHead>
                            <TableHead>Basis</TableHead>
                            <TableHead className="text-right">
                                Reported
                            </TableHead>
                            <TableHead className="text-right">
                                Your ledger
                            </TableHead>
                            <TableHead className="text-right">
                                Difference
                            </TableHead>
                            <TableHead>
                                <span className="sr-only">Actions</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {entries.map((entry) => (
                            <ReconciliationRow
                                entry={entry}
                                externalFirms={externalFirms}
                                isRemovePending={remove.isPending}
                                key={entry.id}
                                onEdit={(trigger) => {
                                    const stored = statementById.get(entry.id);
                                    if (stored !== undefined) {
                                        startEditing(stored, trigger);
                                    }
                                }}
                                onRemove={() => {
                                    remove.mutate({ id: entry.id });
                                }}
                            />
                        ))}
                    </TableBody>
                </Table>
            )}
            <StatementForm
                editing={editing}
                externalFirms={externalFirms}
                key={editing?.id ?? 'new'}
                onDone={stopEditing}
            />
        </section>
    );
}

function formatLagDays(estimate: null | SampledEstimate): string {
    if (estimate === null) return NOT_APPLICABLE;
    const standardError =
        estimate.standardError === null
            ? NOT_APPLICABLE
            : estimate.standardError.toFixed(1);
    return `${estimate.value.toFixed(1)} days (SE ${standardError}, n = ${String(estimate.n)})`;
}

function LedgerFilterBar({
    accountOptions,
    filters,
    onChange,
}: {
    accountOptions: readonly AccountFilterOption[];
    filters: LedgerFilters;
    onChange: (next: LedgerFilters) => void;
}) {
    const isFiltered =
        filters.accountId !== DEFAULT_LEDGER_FILTERS.accountId ||
        filters.entries !== DEFAULT_LEDGER_FILTERS.entries ||
        filters.from !== DEFAULT_LEDGER_FILTERS.from ||
        filters.to !== DEFAULT_LEDGER_FILTERS.to;
    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-col gap-2">
                <Label htmlFor="ledger-filter-account">Account</Label>
                <Select
                    onValueChange={(value) => {
                        onChange({
                            ...filters,
                            accountId: value === ALL ? null : value,
                        });
                    }}
                    value={filters.accountId ?? ALL}
                >
                    <SelectTrigger id="ledger-filter-account">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All accounts</SelectItem>
                        {accountOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex min-w-44 flex-col gap-2">
                <Label htmlFor="ledger-filter-entries">Entries</Label>
                <Select
                    onValueChange={(value) => {
                        const entries = ENTRY_FILTERS.get(value);
                        if (entries !== undefined) {
                            onChange({ ...filters, entries });
                        }
                    }}
                    value={filters.entries}
                >
                    <SelectTrigger id="ledger-filter-entries">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.values(LedgerEntryFilter).map((member) => (
                            <SelectItem key={member} value={member}>
                                {ENTRY_FILTER_LABEL[member]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="ledger-filter-from">From</Label>
                <Input
                    id="ledger-filter-from"
                    onChange={(event) => {
                        onChange({
                            ...filters,
                            from: event.target.value || null,
                        });
                    }}
                    type="date"
                    value={filters.from ?? ''}
                />
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="ledger-filter-to">To</Label>
                <Input
                    id="ledger-filter-to"
                    onChange={(event) => {
                        onChange({
                            ...filters,
                            to: event.target.value || null,
                        });
                    }}
                    type="date"
                    value={filters.to ?? ''}
                />
            </div>
            {isFiltered && (
                <Button
                    onClick={() => {
                        onChange(DEFAULT_LEDGER_FILTERS);
                    }}
                    type="button"
                    variant="ghost"
                >
                    Clear filters
                </Button>
            )}
        </div>
    );
}

function LedgerTable({ entries }: { entries: readonly LedgerEntry[] }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Approved on</TableHead>
                    <TableHead>Cash flow</TableHead>
                    <TableHead>Note</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {entries.map((entry) => {
                    const cashFlow = ledgerCashFlow(entry);
                    const note =
                        entry.kind === LedgerEntryKind.Fee
                            ? entry.fee.note
                            : entry.payout.note;
                    return (
                        <TableRow key={`${entry.kind}-${ledgerEntryId(entry)}`}>
                            <TableCell className="align-top tabular-nums">
                                {entry.on}
                            </TableCell>
                            <TableCell className="align-top">
                                {entry.account === null ? (
                                    <span className="text-muted-foreground">
                                        Deleted account
                                    </span>
                                ) : (
                                    ledgerAccountName(entry.account)
                                )}
                            </TableCell>
                            <TableCell className="align-top">
                                {describeEntry(entry)}
                            </TableCell>
                            <TableCell className="text-right align-top tabular-nums">
                                <EntryAmount entry={entry} />
                            </TableCell>
                            <TableCell className="align-top tabular-nums">
                                {entry.kind === LedgerEntryKind.Payout
                                    ? (entry.payout.approvedOn ?? '')
                                    : ''}
                            </TableCell>
                            <TableCell
                                className={cn(
                                    'align-top',
                                    cashFlow === LedgerCashFlow.In &&
                                        'text-emerald-400',
                                    cashFlow === LedgerCashFlow.Out &&
                                        'text-amber-400',
                                    cashFlow === LedgerCashFlow.None &&
                                        'text-muted-foreground',
                                )}
                            >
                                {CASH_FLOW_LABEL[cashFlow]}
                            </TableCell>
                            <TableCell className="max-w-xs align-top text-xs whitespace-pre-line text-muted-foreground">
                                {note ?? ''}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

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
            <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">
                        Payouts received ({cash.paidPayouts} paid)
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                        {formatUsdCents(cash.payouts)}
                    </dd>
                </div>
                <div className="rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">
                        Spend after {formatUsdCents(cash.refunds)} refunds
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                        {formatUsdCents(cash.spend)}
                    </dd>
                </div>
                <div className="rounded-md border border-border p-3">
                    <dt className="text-xs text-muted-foreground">
                        Net in these rows
                    </dt>
                    <dd
                        className={cn(
                            'text-lg font-semibold tabular-nums',
                            cash.net < 0
                                ? 'text-amber-400'
                                : 'text-emerald-400',
                        )}
                    >
                        {formatUsdCents(cash.net)}
                    </dd>
                </div>
            </dl>
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
            <h3 className="text-sm font-medium text-white">
                Payout lag by firm
            </h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Firm</TableHead>
                        <TableHead>Request to approval</TableHead>
                        <TableHead>Request to paid</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell>{row.firm}</TableCell>
                            <TableCell className="tabular-nums">
                                {row.requestToApproval}
                            </TableCell>
                            <TableCell className="tabular-nums">
                                {row.requestToPaid}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
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
function ReconciliationRow({
    entry,
    externalFirms,
    isRemovePending,
    onEdit,
    onRemove,
}: {
    readonly entry: FirmReconciliationEntry;
    readonly externalFirms: readonly ExternalFirmName[];
    readonly isRemovePending: boolean;
    readonly onEdit: (trigger: HTMLElement) => void;
    readonly onRemove: () => void;
}) {
    return (
        <TableRow>
            <TableCell>{firmKeyLabel(entry.firmKey, externalFirms)}</TableCell>
            <TableCell className="tabular-nums">{entry.asOf}</TableCell>
            <TableCell>{reportedPayoutBasisLabel(entry.basis)}</TableCell>
            <TableCell className="text-right tabular-nums">
                {formatUsdCents(entry.reportedPayoutCents)}
                {entry.decreasedFromPrevious && (
                    <div className="text-xs text-amber-400">
                        Down from the previous statement
                    </div>
                )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {formatUsdCents(entry.ledgerPaidCents)}
                {entry.grossOnlyCount > 0 && (
                    <div className="text-xs text-muted-foreground">
                        {entry.grossOnlyCount} paid without a net amount
                    </div>
                )}
            </TableCell>
            <TableCell
                className={cn(
                    'text-right tabular-nums',
                    !entry.withinTolerance && 'text-amber-400',
                )}
            >
                {formatUsdCents(usdCents(entry.differenceCents))}
                {!entry.withinTolerance && (
                    <div className="text-xs">Outside tolerance</div>
                )}
            </TableCell>
            <TableCell>
                <div className="flex justify-end gap-1">
                    <Button
                        aria-label={`Edit the statement as of ${entry.asOf}`}
                        onClick={(event) => {
                            onEdit(event.currentTarget);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                    >
                        <Pencil />
                    </Button>
                    <RemoveRecordDialog
                        confirmText="Delete"
                        description="This permanently removes the statement."
                        isPending={isRemovePending}
                        onConfirm={onRemove}
                        title="Delete this statement?"
                        triggerLabel={`Delete the statement as of ${entry.asOf}`}
                    />
                </div>
            </TableCell>
        </TableRow>
    );
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

    const save = async (values: StatementFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        try {
            if ('id' in parsed.data) {
                await update.mutateAsync(parsed.data);
                toast.success('Statement saved');
                onDone();
            } else {
                await create.mutateAsync(parsed.data);
                toast.success('Statement recorded');
                form.reset(emptyStatementValues());
            }
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Could not save',
            );
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <Form {...form}>
            <form
                aria-label={
                    editing === null
                        ? 'Add a firm statement'
                        : 'Edit firm statement'
                }
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                noValidate
                onSubmit={(event) => {
                    void form.handleSubmit(save)(event);
                }}
            >
                {editing === null ? (
                    <FormField
                        control={form.control}
                        name="firmValue"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Firm</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <FormControl>
                                        <SelectTrigger ref={field.ref}>
                                            <SelectValue />
                                        </SelectTrigger>
                                    </FormControl>
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
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : (
                    <div className="flex flex-col gap-2">
                        <Label>Firm</Label>
                        <p className="text-sm text-muted-foreground">
                            {firmKeyLabel(
                                firmKeyOf(firmColumnsOf(editing)),
                                externalFirms,
                            )}
                        </p>
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="asOf"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>As of</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="basis"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Basis</FormLabel>
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
                                <FormControl>
                                    <SelectTrigger ref={field.ref}>
                                        <SelectValue placeholder="Choose gross or net" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {Object.values(ReportedPayoutBasis).map(
                                        (basis) => (
                                            <SelectItem
                                                key={basis}
                                                value={basis}
                                            >
                                                {reportedPayoutBasisLabel(
                                                    basis,
                                                )}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="reportedPayoutCents"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Reported total</FormLabel>
                            <FormControl>
                                <Input
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                The total your firm dashboard shows as of this
                                date.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
                    <Button
                        disabled={create.isPending || update.isPending}
                        type="submit"
                    >
                        {editing === null ? 'Add statement' : 'Save statement'}
                    </Button>
                    {editing !== null && (
                        <Button onClick={onDone} type="button" variant="ghost">
                            Cancel edit
                        </Button>
                    )}
                </div>
            </form>
        </Form>
    );
}

function statementFormSchema(editingId: null | string) {
    return statementFormShape.transform((values, context) => {
        if (values.basis === UNSET_BASIS) {
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
    basis: z.union([z.enum(ReportedPayoutBasis), z.literal(UNSET_BASIS)]),
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
            form.reset(emptyTransferValues());
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
        <Form {...form}>
            <form
                aria-label={
                    editing === null ? 'Add a transfer' : 'Edit transfer'
                }
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                noValidate
                onSubmit={(event) => {
                    void form.handleSubmit(save)(event);
                }}
            >
                <FormField
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Kind</FormLabel>
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
                                <FormControl>
                                    <SelectTrigger ref={field.ref}>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {Object.values(BankrollTransferKind).map(
                                        (kind) => (
                                            <SelectItem key={kind} value={kind}>
                                                {bankrollTransferKindLabel(
                                                    kind,
                                                )}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="amountCents"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                                <Input
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="occurredOn"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Date</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Note (optional)</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
                    <Button
                        disabled={create.isPending || update.isPending}
                        type="submit"
                    >
                        {editing === null ? 'Add transfer' : 'Save transfer'}
                    </Button>
                    {editing !== null && (
                        <Button onClick={onDone} type="button" variant="ghost">
                            Cancel edit
                        </Button>
                    )}
                </div>
            </form>
        </Form>
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
