import type { CurrencyCode } from '~/lib/accounting/core/currency';
import type { ISODate } from '~/lib/accounting/core/date';
import type { LedgerId } from '~/lib/accounting/core/ids';

export type { CurrencyCode } from '~/lib/accounting/core/currency';
export type { ISODate } from '~/lib/accounting/core/date';

export const BOOKING_DIRECTIONS = ['IN', 'OUT'] as const;
export interface BankAccount {
    currency: CurrencyCode;
    ledger: LedgerRef;
}

export interface Booking {
    amountEur: number;
    bank: LedgerRef;
    counterpartLedger: LedgerRef;
    counterpartName: string;
    date: ISODate;
    direction: BookingDirection;
    isRefund?: boolean;
    notes: string[];
    sourceCurrency: CurrencyCode;
    taxCode: string;
    txnId: string;
}

export type BookingDirection = (typeof BOOKING_DIRECTIONS)[number];

export interface ConversionResult {
    bookings: Booking[];
    matches: MatchAudit[];
    missingBankCurrencies: CurrencyCode[];
    skippedCurrency: number;
    skippedNoBank: number;
    unknowns: UnknownMerchant[];
}

export interface DateRange {
    end: ISODate;
    start: ISODate;
}

export interface LedgerRef {
    id: LedgerId;
    label: string;
}

export interface MatchAudit {
    count: number;
    direction: BookingDirection;
    matchedDisplay: string;
    rawName: string;
    totalEur: number;
}

export interface RawTransaction {
    date: ISODate;
    direction: BookingDirection;
    isRefund?: boolean;
    merchant: string;
    sourceAmount: number;
    sourceCurrency: CurrencyCode;
    sourceFee: number;
    sourceFeeCurrency: CurrencyCode | null;
    sourceId: string;
    txnId: string;
}

export interface TransactionMatch {
    display: string;
    ledgerId: LedgerId;
    ledgerLabel: string;
}

export interface UnknownMerchant {
    count: number;
    direction: BookingDirection;
    firstSeen: ISODate;
    lastSeen: ISODate;
    rawName: string;
}
