import Papa from 'papaparse';

import type {
    PropAccountRow,
    PropFeeRow,
    PropPayoutRow,
} from '~/server/db/schemas/prop';

import {
    AccountTracking,
    compareText,
    type ExternalFirmName,
    FeeKind,
    firmKeyLabel,
    firmKeyOf,
    paidPayoutCash,
    trackedAccountOf,
    usdCentsToText,
} from '~/lib/prop-accounts/core';
import {
    type LedgerFeeRow,
    type LedgerPayoutRow,
} from '~/lib/prop-accounts/metrics';

export enum LedgerCashFlow {
    In = 'in',
    None = 'none',
    Out = 'out',
}

export enum LedgerCsvColumn {
    Account = 'account',
    AccountId = 'accountId',
    Amount = 'amount',
    ApprovedOn = 'approvedOn',
    CashFlow = 'cashFlow',
    Date = 'date',
    Entry = 'entry',
    Firm = 'firm',
    Gross = 'gross',
    Kind = 'kind',
    Net = 'net',
    Note = 'note',
    PaidOn = 'paidOn',
    Plan = 'plan',
    RequestedOn = 'requestedOn',
    Status = 'status',
}

export enum LedgerEntryFilter {
    All = 'all',
    Fees = 'fees',
    Payouts = 'payouts',
}

export enum LedgerEntryKind {
    Fee = 'fee',
    Payout = 'payout',
}

export type LedgerAccount = Pick<
    PropAccountRow,
    | 'archivedAt'
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'label'
    | 'planLabel'
    | 'planSerial'
    | 'tracking'
>;

export type LedgerEntry =
    | {
          readonly account: LedgerAccount | null;
          readonly fee: LedgerExportFee;
          readonly kind: LedgerEntryKind.Fee;
          readonly on: string;
      }
    | {
          readonly account: LedgerAccount | null;
          readonly kind: LedgerEntryKind.Payout;
          readonly on: string;
          readonly payout: LedgerExportPayout;
      };

export type LedgerExportFee = LedgerFeeRow & Pick<PropFeeRow, 'note'>;

export type LedgerExportPayout = LedgerPayoutRow & Pick<PropPayoutRow, 'note'>;

export interface LedgerFilters {
    readonly accountId: null | string;
    readonly entries: LedgerEntryFilter;
    readonly from: null | string;
    readonly to: null | string;
}

export const LEDGER_CSV_COLUMNS: readonly LedgerCsvColumn[] = [
    LedgerCsvColumn.Date,
    LedgerCsvColumn.Account,
    LedgerCsvColumn.Firm,
    LedgerCsvColumn.Plan,
    LedgerCsvColumn.Entry,
    LedgerCsvColumn.Kind,
    LedgerCsvColumn.Status,
    LedgerCsvColumn.RequestedOn,
    LedgerCsvColumn.PaidOn,
    LedgerCsvColumn.Gross,
    LedgerCsvColumn.Net,
    LedgerCsvColumn.Amount,
    LedgerCsvColumn.CashFlow,
    LedgerCsvColumn.Note,
    LedgerCsvColumn.AccountId,
    LedgerCsvColumn.ApprovedOn,
];

export const DEFAULT_LEDGER_FILTERS: LedgerFilters = {
    accountId: null,
    entries: LedgerEntryFilter.All,
    from: null,
    to: null,
};

type LedgerCsvRow = Readonly<Record<LedgerCsvColumn, string>>;

const CSV_LINE_BREAK = '\r\n';
const FORMULA_START = /^[=+\-@\t\r]/u;
const LEDGER_FILE_PREFIX = 'prop-ledger';

const ENTRY_ORDER: Readonly<Record<LedgerEntryKind, number>> = {
    [LedgerEntryKind.Fee]: 1,
    [LedgerEntryKind.Payout]: 0,
};

export function buildLedgerEntries(
    accounts: readonly LedgerAccount[],
    payouts: readonly LedgerExportPayout[],
    fees: readonly LedgerExportFee[],
): readonly LedgerEntry[] {
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const entries: LedgerEntry[] = [
        ...payouts.map((payout) => ({
            account: byId.get(payout.accountId) ?? null,
            kind: LedgerEntryKind.Payout as const,
            on: payout.paidOn ?? payout.requestedOn,
            payout,
        })),
        ...fees.map((fee) => ({
            account: byId.get(fee.accountId) ?? null,
            fee,
            kind: LedgerEntryKind.Fee as const,
            on: fee.paidOn,
        })),
    ];
    return entries.toSorted(
        (first, second) =>
            compareText(second.on, first.on) ||
            ENTRY_ORDER[first.kind] - ENTRY_ORDER[second.kind] ||
            compareText(ledgerEntryId(first), ledgerEntryId(second)),
    );
}

export function filterLedgerEntries(
    entries: readonly LedgerEntry[],
    filters: LedgerFilters,
): readonly LedgerEntry[] {
    return entries.filter(
        (entry) =>
            (filters.accountId === null ||
                ledgerEntryAccountId(entry) === filters.accountId) &&
            isInEntryFilter(entry, filters.entries) &&
            (filters.from === null ||
                compareText(entry.on, filters.from) >= 0) &&
            (filters.to === null || compareText(entry.on, filters.to) <= 0),
    );
}

export function ledgerAccountName(account: LedgerAccount): string {
    return account.archivedAt === null
        ? account.label
        : `${account.label} (archived)`;
}

export function ledgerCashFlow(entry: LedgerEntry): LedgerCashFlow {
    switch (entry.kind) {
        case LedgerEntryKind.Fee: {
            return entry.fee.kind === FeeKind.Refund
                ? LedgerCashFlow.In
                : LedgerCashFlow.Out;
        }
        case LedgerEntryKind.Payout: {
            return paidPayoutCash(entry.payout) === null
                ? LedgerCashFlow.None
                : LedgerCashFlow.In;
        }
    }
}

export function ledgerCsv(
    entries: readonly LedgerEntry[],
    externalFirms: readonly ExternalFirmName[] = [],
): string {
    const text = Papa.unparse(
        [
            [...LEDGER_CSV_COLUMNS],
            ...entries.map((entry) => {
                const row = ledgerCsvRow(entry, externalFirms);
                return LEDGER_CSV_COLUMNS.map((column) => row[column]);
            }),
        ],
        { escapeFormulae: FORMULA_START, newline: CSV_LINE_BREAK },
    );
    return `${text}${CSV_LINE_BREAK}`;
}

export function ledgerCsvFileName(today: string): string {
    return `${LEDGER_FILE_PREFIX}-${today}.csv`;
}

export function ledgerEntryAccountId(entry: LedgerEntry): string {
    switch (entry.kind) {
        case LedgerEntryKind.Fee: {
            return entry.fee.accountId;
        }
        case LedgerEntryKind.Payout: {
            return entry.payout.accountId;
        }
    }
}

export function ledgerEntryId(entry: LedgerEntry): string {
    switch (entry.kind) {
        case LedgerEntryKind.Fee: {
            return entry.fee.id;
        }
        case LedgerEntryKind.Payout: {
            return entry.payout.id;
        }
    }
}

function accountCells(
    entry: LedgerEntry,
    externalFirms: readonly ExternalFirmName[],
): Pick<
    LedgerCsvRow,
    | LedgerCsvColumn.Account
    | LedgerCsvColumn.AccountId
    | LedgerCsvColumn.Firm
    | LedgerCsvColumn.Plan
> {
    const accountId = ledgerEntryAccountId(entry);
    const account =
        entry.account === null ? null : trackedAccountOf(entry.account);
    return {
        [LedgerCsvColumn.Account]:
            account === null ? accountId : ledgerAccountName(account),
        [LedgerCsvColumn.AccountId]: accountId,
        [LedgerCsvColumn.Firm]:
            account === null
                ? ''
                : firmKeyLabel(firmKeyOf(account), externalFirms),
        [LedgerCsvColumn.Plan]:
            account === null
                ? ''
                : account.tracking === AccountTracking.Modeled
                  ? account.planSerial
                  : account.planLabel,
    };
}

function isInEntryFilter(
    entry: LedgerEntry,
    filter: LedgerEntryFilter,
): boolean {
    switch (filter) {
        case LedgerEntryFilter.All: {
            return true;
        }
        case LedgerEntryFilter.Fees: {
            return entry.kind === LedgerEntryKind.Fee;
        }
        case LedgerEntryFilter.Payouts: {
            return entry.kind === LedgerEntryKind.Payout;
        }
    }
}

function ledgerCsvRow(
    entry: LedgerEntry,
    externalFirms: readonly ExternalFirmName[],
): LedgerCsvRow {
    const shared = {
        ...accountCells(entry, externalFirms),
        [LedgerCsvColumn.CashFlow]: ledgerCashFlow(entry),
        [LedgerCsvColumn.Date]: entry.on,
        [LedgerCsvColumn.Entry]: entry.kind,
    };
    switch (entry.kind) {
        case LedgerEntryKind.Fee: {
            const { fee } = entry;
            return {
                ...shared,
                [LedgerCsvColumn.Amount]: usdCentsToText(fee.amountCents),
                [LedgerCsvColumn.ApprovedOn]: '',
                [LedgerCsvColumn.Gross]: '',
                [LedgerCsvColumn.Kind]: fee.kind,
                [LedgerCsvColumn.Net]: '',
                [LedgerCsvColumn.Note]: fee.note ?? '',
                [LedgerCsvColumn.PaidOn]: fee.paidOn,
                [LedgerCsvColumn.RequestedOn]: '',
                [LedgerCsvColumn.Status]: '',
            };
        }
        case LedgerEntryKind.Payout: {
            const { payout } = entry;
            return {
                ...shared,
                [LedgerCsvColumn.Amount]: '',
                [LedgerCsvColumn.ApprovedOn]: payout.approvedOn ?? '',
                [LedgerCsvColumn.Gross]: usdCentsToText(payout.grossCents),
                [LedgerCsvColumn.Kind]: '',
                [LedgerCsvColumn.Net]:
                    payout.netCents === null
                        ? ''
                        : usdCentsToText(payout.netCents),
                [LedgerCsvColumn.Note]: payout.note ?? '',
                [LedgerCsvColumn.PaidOn]: payout.paidOn ?? '',
                [LedgerCsvColumn.RequestedOn]: payout.requestedOn,
                [LedgerCsvColumn.Status]: payout.status,
            };
        }
    }
}
