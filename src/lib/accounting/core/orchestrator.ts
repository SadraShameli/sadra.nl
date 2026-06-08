import type { VatCode } from '../providers/eboekhouden/enums';
import type { RateProvider } from '../rates/provider';
import type {
    Booking,
    BookingDirection,
    ConversionResult,
    ISODate,
    LedgerRef,
    MatchAudit,
    RawTransaction,
    TransactionMatch,
    UnknownMerchant,
} from './types';

import { wiseBank } from '../config/ledgers';
import { MERCHANTS, PAYOUT_SOURCES } from '../config/rules';
import { convertToEur, round2 } from './money';
import { findRule } from './rules';

export interface BuildBookingsInput {
    rates: RateProvider;
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

interface Resolved {
    display: string;
    ledger: LedgerRef;
    vatCode: VatCode;
}
export function buildBookings(input: BuildBookingsInput): ConversionResult {
    const aggregates = new Map<string, Aggregate>();
    const unknownDates = new Map<string, ISODate[]>();
    const matchAmounts = new Map<string, number[]>();
    let skippedCurrency = 0;

    for (const tx of input.transactions) {
        if (tx.date < input.start) continue;
        const resolved = resolveRule(tx);
        if (!resolved) {
            const key = `${tx.merchant}|${tx.direction}`;
            const list = unknownDates.get(key);
            if (list) list.push(tx.date);
            else unknownDates.set(key, [tx.date]);
            continue;
        }
        const { eur, note } = convertToEur(tx, input.rates);
        if (eur === null) {
            skippedCurrency += 1;
            continue;
        }

        const matchKey = `${tx.merchant}|${resolved.display}|${tx.direction}`;
        const matchList = matchAmounts.get(matchKey);
        if (matchList) matchList.push(eur);
        else matchAmounts.set(matchKey, [eur]);

        const existing = aggregates.get(tx.txnId);
        if (existing) {
            existing.eur = round2(existing.eur + eur);
            existing.notes.push(note);
        } else {
            aggregates.set(tx.txnId, {
                bank: wiseBank(tx.sourceCurrency),
                counterpartLedger: resolved.ledger,
                counterpartName: resolved.display,
                date: tx.date,
                direction: tx.direction,
                eur,
                notes: [note],
                vatCode: resolved.vatCode,
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

    return { bookings, matches, skippedCurrency, unknowns };
}

export function classifyTransaction(
    tx: RawTransaction,
): null | TransactionMatch {
    const resolved = resolveRule(tx);
    if (!resolved) return null;
    return {
        display: resolved.display,
        ledgerId: resolved.ledger.id,
        ledgerLabel: resolved.ledger.label,
    };
}

export function collectDates(
    transactions: Iterable<RawTransaction>,
    start: ISODate,
): ISODate[] {
    const out: ISODate[] = [];
    for (const tx of transactions) {
        if (tx.date < start) continue;
        if (resolveRule(tx) !== null) out.push(tx.date);
    }
    return out;
}

function resolveRule(tx: RawTransaction): null | Resolved {
    if (tx.direction === 'OUT') {
        const rule = findRule(MERCHANTS, tx.merchant);
        if (!rule) return null;
        return {
            display: rule.display,
            ledger: rule.ledger,
            vatCode: rule.vatCode,
        };
    }
    const payout = findRule(PAYOUT_SOURCES, tx.merchant);
    if (!payout) return null;
    return {
        display: payout.display,
        ledger: payout.ledger,
        vatCode: payout.vatCode,
    };
}
