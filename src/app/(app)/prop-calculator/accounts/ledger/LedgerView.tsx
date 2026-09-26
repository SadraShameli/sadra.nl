'use client';

import { Download, Receipt, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { EmptyState } from '~/components/ui/EmptyState';
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
import {
    compareText,
    FeeKind,
    formatUsdCents,
    PayoutStatus,
    summarizeCash,
    todayIsoDate,
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
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import { ACCOUNT_LIST_INPUT } from '../_components/accountListFilters';

const ALL = 'all';
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

const FEE_KIND_LABEL: Readonly<Record<FeeKind, string>> = {
    [FeeKind.Activation]: 'Activation fee',
    [FeeKind.EvalPurchase]: 'Evaluation purchase',
    [FeeKind.FundedReset]: 'Funded reset',
    [FeeKind.Other]: 'Other fee',
    [FeeKind.Rebuy]: 'Rebuy',
    [FeeKind.Refund]: 'Refund',
    [FeeKind.Reset]: 'Reset',
    [FeeKind.Subscription]: 'Subscription',
};

const PAYOUT_STATUS_LABEL: Readonly<Record<PayoutStatus, string>> = {
    [PayoutStatus.Cancelled]: 'Payout cancelled',
    [PayoutStatus.Denied]: 'Payout denied',
    [PayoutStatus.Paid]: 'Payout paid',
    [PayoutStatus.Requested]: 'Payout requested',
};

const LEDGER_LIST_INPUT = {};

const ENTRY_FILTERS: ReadonlyMap<string, LedgerEntryFilter> = new Map(
    Object.values(LedgerEntryFilter).map((member) => [member, member]),
);

interface AccountFilterOption {
    readonly label: string;
    readonly value: string;
}

export function LedgerView() {
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const payoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const feesQuery = api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const [filters, setFilters] = useState<LedgerFilters>(
        DEFAULT_LEDGER_FILTERS,
    );

    const accounts = accountsQuery.data;
    const payouts = payoutsQuery.data;
    const fees = feesQuery.data;
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

    const failed = [accountsQuery, payoutsQuery, feesQuery].find(
        (query) => query.isError,
    );
    if (failed?.error) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>The ledger could not be loaded</AlertTitle>
                <AlertDescription>{failed.error.message}</AlertDescription>
            </Alert>
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
                    disabled={visible.length === 0}
                    onClick={() => {
                        const today = todayIsoDate(new Date());
                        downloadCsv(
                            ledgerCsv(visible),
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
                <p className="text-xs text-muted-foreground">
                    Amounts are exact decimal dollars; refunds carry the kind
                    refund and cash flow in. Cells that a spreadsheet could run
                    as a formula start with an apostrophe.
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
        </section>
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

function describeEntry(entry: LedgerEntry): string {
    switch (entry.kind) {
        case LedgerEntryKind.Fee: {
            return FEE_KIND_LABEL[entry.fee.kind];
        }
        case LedgerEntryKind.Payout: {
            return PAYOUT_STATUS_LABEL[entry.payout.status];
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
            {cash.grossOnlyPayouts > 0 && (
                <p className="text-xs text-amber-400">
                    {cash.grossOnlyPayouts} paid{' '}
                    {cash.grossOnlyPayouts === 1
                        ? 'payout has'
                        : 'payouts have'}{' '}
                    no net amount, so the gross amount is counted as received.
                </p>
            )}
        </div>
    );
}
