import type { Rule } from '~/lib/accounting/core/rules/rule';
import type { RuleSet } from '~/lib/accounting/core/rules/rule-set';
import type { TaxCode } from '~/lib/accounting/core/tax-code';
import type {
    Booking,
    BookingDirection,
    ConversionResult,
    CurrencyCode,
    ISODate,
    LedgerReference,
    MatchAudit,
    RawTransaction,
    UnknownMerchant,
} from '~/lib/accounting/core/types';

import { IsoDate } from '~/lib/accounting/core/date';
import { TxnId } from '~/lib/accounting/core/ids';
import { type CurrencyConverter, Eur } from '~/lib/accounting/core/money';

const compareBookings = (a: Booking, b: Booking): number => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1;
    return a.counterpartName.localeCompare(b.counterpartName);
};

const compareUnknowns = (a: UnknownMerchant, b: UnknownMerchant): number => {
    if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    return a.rawName.localeCompare(b.rawName);
};

const compareMatches = (a: MatchAudit, b: MatchAudit): number => {
    if (a.direction !== b.direction) return a.direction < b.direction ? -1 : 1;
    if (a.matchedDisplay !== b.matchedDisplay)
        return a.matchedDisplay.localeCompare(b.matchedDisplay);
    if (a.count !== b.count) return b.count - a.count;
    return a.rawName.localeCompare(b.rawName);
};

class BookingAccumulator {
    private eur: Eur;

    private readonly noteList: string[];

    constructor(
        private readonly bank: LedgerReference,
        private readonly counterpartLedger: LedgerReference,
        private readonly counterpartName: string,
        private readonly date: ISODate,
        private readonly direction: BookingDirection,
        private readonly isRefund: boolean,
        private readonly sourceCurrency: CurrencyCode,
        private readonly taxCode: TaxCode,
        eur: Eur,
        note: string,
    ) {
        this.eur = eur;
        this.noteList = [note];
    }

    addLeg(eur: Eur, note: string): void {
        this.eur = Eur.add(this.eur, eur);
        this.noteList.push(note);
    }

    toBooking(txnId: TxnId): Booking {
        return {
            amountEur: Eur.toNumber(this.eur),
            bank: this.bank,
            counterpartLedger: this.counterpartLedger,
            counterpartName: this.counterpartName,
            date: this.date,
            direction: this.direction,
            isRefund: this.isRefund,
            notes: this.noteList,
            sourceCurrency: this.sourceCurrency,
            taxCode: this.taxCode.toString(),
            txnId,
        };
    }
}

class MatchTotal {
    private count = 1;
    private total: Eur;

    constructor(eur: Eur) {
        this.total = eur;
    }

    add(eur: Eur): void {
        this.count += 1;
        this.total = Eur.add(this.total, eur);
    }

    toAudit(
        rawName: string,
        matchedDisplay: string,
        direction: BookingDirection,
    ): MatchAudit {
        return {
            count: this.count,
            direction,
            matchedDisplay,
            rawName,
            totalEur: Eur.toNumber(this.total),
        };
    }
}

class MatchAuditTracker {
    private readonly totals = new Map<
        string,
        Map<string, Map<BookingDirection, MatchTotal>>
    >();

    record(
        merchant: string,
        matchedDisplay: string,
        direction: BookingDirection,
        eur: Eur,
    ): void {
        let byDisplay = this.totals.get(merchant);
        if (!byDisplay) {
            byDisplay = new Map<string, Map<BookingDirection, MatchTotal>>();
            this.totals.set(merchant, byDisplay);
        }
        let byDirection = byDisplay.get(matchedDisplay);
        if (!byDirection) {
            byDirection = new Map<BookingDirection, MatchTotal>();
            byDisplay.set(matchedDisplay, byDirection);
        }
        const existing = byDirection.get(direction);
        if (existing) {
            existing.add(eur);
        } else {
            byDirection.set(direction, new MatchTotal(eur));
        }
    }

    toArray(): MatchAudit[] {
        const out: MatchAudit[] = [];
        for (const [rawName, byDisplay] of this.totals) {
            for (const [matchedDisplay, byDirection] of byDisplay) {
                for (const [direction, total] of byDirection) {
                    out.push(total.toAudit(rawName, matchedDisplay, direction));
                }
            }
        }
        return out.toSorted(compareMatches);
    }
}

class UnknownOccurrences {
    private readonly dates: ISODate[] = [];

    record(date: ISODate): void {
        this.dates.push(date);
    }

    toUnknownMerchant(
        rawName: string,
        direction: BookingDirection,
    ): null | UnknownMerchant {
        const sorted = this.dates.toSorted(
            (a, b) => Number(a > b) - Number(a < b),
        );
        const firstSeen = sorted[0];
        const lastSeen = sorted.at(-1);
        if (firstSeen === undefined || lastSeen === undefined) return null;
        return {
            count: this.dates.length,
            direction,
            firstSeen,
            lastSeen,
            rawName,
        };
    }
}

class UnknownMerchantTracker {
    private readonly occurrences = new Map<
        string,
        Map<BookingDirection, UnknownOccurrences>
    >();

    record(merchant: string, direction: BookingDirection, date: ISODate): void {
        let byDirection = this.occurrences.get(merchant);
        if (!byDirection) {
            byDirection = new Map<BookingDirection, UnknownOccurrences>();
            this.occurrences.set(merchant, byDirection);
        }
        let bucket = byDirection.get(direction);
        if (!bucket) {
            bucket = new UnknownOccurrences();
            byDirection.set(direction, bucket);
        }
        bucket.record(date);
    }

    toArray(): UnknownMerchant[] {
        const out: UnknownMerchant[] = [];
        for (const [rawName, byDirection] of this.occurrences) {
            for (const [direction, bucket] of byDirection) {
                const unknown = bucket.toUnknownMerchant(rawName, direction);
                if (unknown) out.push(unknown);
            }
        }
        return out.toSorted(compareUnknowns);
    }
}

export class BookingAggregator {
    private readonly accumulators = new Map<TxnId, BookingAccumulator>();

    private readonly matchAudits = new MatchAuditTracker();

    private readonly missingBankCurrencies = new Set<CurrencyCode>();

    private skippedCurrency = 0;

    private skippedNoBank = 0;
    private readonly unknownMerchants = new UnknownMerchantTracker();
    constructor(
        private readonly ruleSet: RuleSet,
        private readonly converter: CurrencyConverter,
        private readonly bankByCurrency: ReadonlyMap<
            CurrencyCode,
            LedgerReference
        >,
        private readonly start: ISODate,
    ) {}

    ingest(tx: RawTransaction): void {
        if (IsoDate.isBefore(tx.date, this.start)) return;

        const rule = this.ruleSet.findMatch(tx);
        if (!rule) {
            this.unknownMerchants.record(tx.merchant, tx.direction, tx.date);
            return;
        }

        const bank = this.bankByCurrency.get(tx.sourceCurrency);
        if (!bank) {
            this.skippedNoBank += 1;
            this.missingBankCurrencies.add(tx.sourceCurrency);
            return;
        }

        const { eur, note } = this.converter.convert(tx);
        if (eur === null) {
            this.skippedCurrency += 1;
            return;
        }

        this.matchAudits.record(tx.merchant, rule.display, tx.direction, eur);

        const txnId = TxnId(tx.txnId);
        const existing = this.accumulators.get(txnId);
        if (existing) {
            existing.addLeg(eur, note);
        } else {
            this.accumulators.set(
                txnId,
                startBookingAccumulator(bank, rule, tx, tx.date, eur, note),
            );
        }
    }

    result(): ConversionResult {
        const bookings = [...this.accumulators]
            .map(([txnId, accumulator]) => accumulator.toBooking(txnId))
            .toSorted(compareBookings);

        return {
            bookings,
            matches: this.matchAudits.toArray(),
            missingBankCurrencies: [...this.missingBankCurrencies].toSorted(
                (a, b) => Number(a > b) - Number(a < b),
            ),
            skippedCurrency: this.skippedCurrency,
            skippedNoBank: this.skippedNoBank,
            unknowns: this.unknownMerchants.toArray(),
        };
    }
}

export function requiredCurrencies(
    transactions: Iterable<RawTransaction>,
    start: ISODate,
    ruleSet: RuleSet,
): CurrencyCode[] {
    const currencies = new Set<CurrencyCode>();
    for (const tx of transactions) {
        if (IsoDate.isBefore(tx.date, start)) continue;
        if (tx.sourceCurrency === 'EUR') continue;
        if (ruleSet.findMatch(tx) !== null) currencies.add(tx.sourceCurrency);
    }
    return [...currencies];
}

export function requiredDateRange(
    transactions: Iterable<RawTransaction>,
    start: ISODate,
    ruleSet: RuleSet,
): ISODate[] {
    const dates: ISODate[] = [];
    for (const tx of transactions) {
        if (IsoDate.isBefore(tx.date, start)) continue;
        if (ruleSet.findMatch(tx) !== null) dates.push(tx.date);
    }
    return dates;
}

function startBookingAccumulator(
    bank: LedgerReference,
    rule: Rule,
    tx: RawTransaction,
    date: ISODate,
    eur: Eur,
    note: string,
): BookingAccumulator {
    return new BookingAccumulator(
        bank,
        rule.ledger,
        rule.display,
        date,
        tx.direction,
        tx.isRefund === true,
        tx.sourceCurrency,
        rule.taxCode,
        eur,
        note,
    );
}
