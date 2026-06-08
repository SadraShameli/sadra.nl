import type { VatCode } from '../providers/eboekhouden/enums';
import type { RateProvider } from '../rates/provider';
import type {
    Booking,
    BookingDirection,
    BookingRule,
    ConversionResult,
    ISODate,
    LedgerRef,
    MatchAudit,
    RawTransaction,
    TransactionMatch,
    UnknownMerchant,
} from './types';

import { convertToEur, round2 } from './money';
import { findRule } from './rules';

export interface BuildBookingsInput {
    bankByCurrency: Map<string, LedgerRef>;
    rates: RateProvider;
    rules: readonly BookingRule[];
    start: ISODate;
    transactions: Iterable<RawTransaction>;
}

interface Aggregate {
    bank: LedgerRef;
    counterpartLedger: LedgerRef;
    counterpartName: string;
    date: ISODate;
    direction: BookingDirection;
    eur: number;
    notes: string[];
    vatCode: VatCode;
}

export function buildBookings(input: BuildBookingsInput): ConversionResult {
    const aggregates = new Map<string, Aggregate>();
    const unknownDates = new Map<string, ISODate[]>();
    const matchAmounts = new Map<string, number[]>();
    const missingBank = new Set<string>();
    let skippedCurrency = 0;
    let skippedNoBank = 0;

    for (const tx of input.transactions) {
        if (tx.date < input.start) continue;
        const rule = findRule(input.rules, tx);
        if (!rule) {
            const key = `${tx.merchant}|${tx.direction}`;
            const list = unknownDates.get(key);
            if (list) list.push(tx.date);
            else unknownDates.set(key, [tx.date]);
            continue;
        }
        const bank = input.bankByCurrency.get(tx.sourceCurrency);
        if (!bank) {
            skippedNoBank += 1;
            missingBank.add(tx.sourceCurrency);
            continue;
        }
        const { eur, note } = convertToEur(tx, input.rates);
        if (eur === null) {
            skippedCurrency += 1;
            continue;
        }

        const matchKey = `${tx.merchant}|${rule.display}|${tx.direction}`;
        const matchList = matchAmounts.get(matchKey);
        if (matchList) matchList.push(eur);
        else matchAmounts.set(matchKey, [eur]);

        const existing = aggregates.get(tx.txnId);
        if (existing) {
            existing.eur = round2(existing.eur + eur);
            existing.notes.push(note);
        } else {
            aggregates.set(tx.txnId, {
                bank,
                counterpartLedger: rule.ledger,
                counterpartName: rule.display,
                date: tx.date,
                direction: tx.direction,
                eur,
                notes: [note],
                vatCode: rule.vatCode,
            });
        }
    }

    const bookings: Booking[] = [...aggregates.entries()]
        .map(([txnId, agg]) => ({
            amountEur: round2(agg.eur),
            bank: agg.bank,
            counterpartLedger: agg.counterpartLedger,
            counterpartName: agg.counterpartName,
            date: agg.date,
            direction: agg.direction,
            notes: agg.notes,
            txnId,
            vatCode: agg.vatCode,
        }))
        .toSorted((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            if (a.direction !== b.direction)
                return a.direction < b.direction ? -1 : 1;
            return a.counterpartName.localeCompare(b.counterpartName);
        });

    const unknowns: UnknownMerchant[] = [...unknownDates.entries()]
        .map<UnknownMerchant>(([key, dates]) => {
            const [rawName, direction] = key.split('|') as [
                string,
                BookingDirection,
            ];
            const sorted = dates.toSorted();
            const firstSeen = sorted[0] ?? '';
            const lastSeen = sorted.at(-1) ?? firstSeen;
            return {
                count: dates.length,
                direction,
                firstSeen,
                lastSeen,
                rawName,
            };
        })
        .toSorted((a, b) => {
            if (a.direction !== b.direction)
                return a.direction < b.direction ? -1 : 1;
            if (a.count !== b.count) return b.count - a.count;
            return a.rawName.localeCompare(b.rawName);
        });

    const matches: MatchAudit[] = [...matchAmounts.entries()]
        .map<MatchAudit>(([key, amounts]) => {
            const [rawName, matchedDisplay, direction] = key.split('|') as [
                string,
                string,
                BookingDirection,
            ];
            return {
                count: amounts.length,
                direction,
                matchedDisplay,
                rawName,
                totalEur: round2(amounts.reduce((s, x) => s + x, 0)),
            };
        })
        .toSorted((a, b) => {
            if (a.direction !== b.direction)
                return a.direction < b.direction ? -1 : 1;
            if (a.matchedDisplay !== b.matchedDisplay)
                return a.matchedDisplay.localeCompare(b.matchedDisplay);
            if (a.count !== b.count) return b.count - a.count;
            return a.rawName.localeCompare(b.rawName);
        });

    return {
        bookings,
        matches,
        missingBankCurrencies: [...missingBank].toSorted(),
        skippedCurrency,
        skippedNoBank,
        unknowns,
    };
}

export function classifyTransaction(
    tx: RawTransaction,
    rules: readonly BookingRule[],
): null | TransactionMatch {
    const rule = findRule(rules, tx);
    if (!rule) return null;
    return {
        display: rule.display,
        ledgerId: rule.ledger.id,
        ledgerLabel: rule.ledger.label,
    };
}

export function collectDates(
    transactions: Iterable<RawTransaction>,
    start: ISODate,
    rules: readonly BookingRule[],
): ISODate[] {
    const out: ISODate[] = [];
    for (const tx of transactions) {
        if (tx.date < start) continue;
        if (findRule(rules, tx) !== null) out.push(tx.date);
    }
    return out;
}
