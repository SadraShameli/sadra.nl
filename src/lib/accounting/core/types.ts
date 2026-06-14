import type { BookingDirection, VatCode } from '../providers/eboekhouden/enums';

export interface BankAccount {
    currency: string;
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
    sourceCurrency: string;
    txnId: string;
    vatCode: VatCode;
}

export interface BookingRule {
    direction: BookingDirection;
    display: string;
    id: string;
    ledger: LedgerRef;
    match: string;
    vatCode: VatCode;
}

export interface ConversionResult {
    bookings: Booking[];
    matches: MatchAudit[];
    missingBankCurrencies: string[];
    skippedCurrency: number;
    skippedNoBank: number;
    unknowns: UnknownMerchant[];
}

export interface DateRange {
    end: ISODate;
    start: ISODate;
}

export type ISODate = string;

export interface LedgerRef {
    id: number;
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
    sourceCurrency: string;
    sourceFee: number;
    sourceFeeCurrency: null | string;
    sourceId: string;
    txnId: string;
}

export interface TransactionMatch {
    display: string;
    ledgerId: number;
    ledgerLabel: string;
}

export interface UnknownMerchant {
    count: number;
    direction: BookingDirection;
    firstSeen: ISODate;
    lastSeen: ISODate;
    rawName: string;
}

export const dateRangeFromList = (dates: ISODate[]): DateRange | null => {
    const sorted = dates.toSorted();
    const first = sorted[0];
    const last = sorted.at(-1);
    if (first === undefined || last === undefined) return null;
    return { end: last, start: first };
};

export {
    type BookingDirection,
    type VatCode,
} from '../providers/eboekhouden/enums';
