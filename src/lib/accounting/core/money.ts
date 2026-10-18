import { add, dinero, type Dinero, toDecimal } from 'dinero.js';
import { EUR } from 'dinero.js/currencies';

import type { CurrencyCode, RawTransaction } from '~/lib/accounting/core/types';
import type { RateProvider } from '~/lib/accounting/rates/provider';

import { currencyCodeSchema, EUR_CODE } from '~/lib/accounting/core/currency';

const CENTS_PER_UNIT = 100;

const AMOUNT_LOCALE = 'en-US';

const AMOUNT_FRACTION_DIGITS = 2;

const ECB_RATE_FRACTION_DIGITS = 4;

const ECB_SOURCE = 'ECB';

const EUR_FEE_MARKER = '+fee';

const UNSUPPORTED_CURRENCY_PREFIX = 'unsupported currency ';

const EUR_AMOUNT_FORMAT = new Intl.NumberFormat(AMOUNT_LOCALE, {
    currency: EUR_CODE,
    maximumFractionDigits: AMOUNT_FRACTION_DIGITS,
    minimumFractionDigits: AMOUNT_FRACTION_DIGITS,
    style: 'currency',
});

const EUR_WHOLE_FORMAT = new Intl.NumberFormat(AMOUNT_LOCALE, {
    currency: EUR_CODE,
    maximumFractionDigits: 0,
    style: 'currency',
});

export interface ConversionSummary {
    readonly descriptions: readonly string[];
    readonly feeEur: number;
}

export interface ConvertedAmount {
    eur: Eur | null;
    note: string;
}

export interface CurrencyAmount {
    readonly amount: number;
    readonly currency: CurrencyCode;
}

export type Eur = Dinero<number, 'EUR'>;

export function toCents(amount: number): number {
    return Math.round(amount * CENTS_PER_UNIT);
}
export const Eur = {
    add: (a: Eur, b: Eur): Eur => add(a, b),
    format: (amount: number): string => EUR_AMOUNT_FORMAT.format(amount),
    formatWhole: (amount: number): string => EUR_WHOLE_FORMAT.format(amount),
    fromNumber: (n: number): Eur =>
        dinero({ amount: Math.round(n * 10 ** EUR.exponent), currency: EUR }),
    toNumber: (value: Eur): number => Number(toDecimal(value)),
    zero: (): Eur => dinero({ amount: 0, currency: EUR }),
};

export const CurrencyAmount = {
    format: (value: CurrencyAmount): string =>
        new Intl.NumberFormat(AMOUNT_LOCALE, {
            currency: value.currency,
            maximumFractionDigits: AMOUNT_FRACTION_DIGITS,
            minimumFractionDigits: AMOUNT_FRACTION_DIGITS,
            style: 'currency',
        }).format(value.amount),
};

abstract class ConversionNoteBase {
    abstract describe(): string;

    feeEur(): Eur {
        return Eur.zero();
    }

    abstract toString(): string;
}

class EcbConversionNote extends ConversionNoteBase {
    private static readonly PATTERN = new RegExp(
        String.raw`^([A-Z]{3})@${ECB_SOURCE}(\d+(?:\.\d+)?)$`,
    );

    static parse(note: string): EcbConversionNote | null {
        const match = this.PATTERN.exec(note);
        if (!match) return null;
        const [, code, rate] = match;
        const currency = currencyCodeSchema.safeParse(code);
        return currency.success ? new this(currency.data, Number(rate)) : null;
    }

    constructor(
        private readonly currency: CurrencyCode,
        private readonly rate: number,
    ) {
        super();
    }

    private formattedRate(): string {
        return this.rate.toFixed(ECB_RATE_FRACTION_DIGITS);
    }

    describe(): string {
        return `${this.currency} → ${EUR_CODE} at ${this.formattedRate()} (${ECB_SOURCE})`;
    }

    toString(): string {
        return `${this.currency}@${ECB_SOURCE}${this.formattedRate()}`;
    }
}

class EurConversionNote extends ConversionNoteBase {
    private static readonly PREFIX = `${EUR_CODE}${EUR_FEE_MARKER}`;

    static parse(note: string): EurConversionNote | null {
        if (!note.startsWith(this.PREFIX)) return null;
        const fee = Number(note.slice(this.PREFIX.length));
        return Number.isFinite(fee) ? new this(fee) : null;
    }

    constructor(private readonly fee: number) {
        super();
    }

    describe(): string {
        return `${EUR_CODE}, no conversion`;
    }

    override feeEur(): Eur {
        return Eur.fromNumber(this.fee);
    }

    toString(): string {
        return `${EurConversionNote.PREFIX}${this.fee.toFixed(AMOUNT_FRACTION_DIGITS)}`;
    }
}

class UnsupportedConversionNote extends ConversionNoteBase {
    static parse(note: string): null | UnsupportedConversionNote {
        if (!note.startsWith(UNSUPPORTED_CURRENCY_PREFIX)) return null;
        const currency = note.slice(UNSUPPORTED_CURRENCY_PREFIX.length);
        return currency === '' ? null : new this(currency);
    }

    constructor(private readonly currency: string) {
        super();
    }

    describe(): string {
        return `Unsupported currency ${this.currency}`;
    }

    toString(): string {
        return `${UNSUPPORTED_CURRENCY_PREFIX}${this.currency}`;
    }
}

const CONVERSION_NOTE_PARSERS: readonly ((
    note: string,
) => ConversionNoteBase | null)[] = [
    (note) => EcbConversionNote.parse(note),
    (note) => EurConversionNote.parse(note),
    (note) => UnsupportedConversionNote.parse(note),
];

export type ConversionNote = ConversionNoteBase;

function parseConversionNote(note: string): ConversionNoteBase | null {
    for (const parse of CONVERSION_NOTE_PARSERS) {
        const parsed = parse(note);
        if (parsed !== null) return parsed;
    }
    return null;
}

export const ConversionNote = {
    ecb: (currency: CurrencyCode, rate: number): ConversionNote =>
        new EcbConversionNote(currency, rate),
    eur: (fee: number): ConversionNote => new EurConversionNote(fee),
    parse: parseConversionNote,
    summarize: (notes: readonly string[]): ConversionSummary => {
        const descriptions = new Set<string>();
        let fee = Eur.zero();
        for (const note of notes) {
            const parsed = parseConversionNote(note);
            descriptions.add(parsed?.describe() ?? note);
            if (parsed !== null) fee = Eur.add(fee, parsed.feeEur());
        }
        return { descriptions: [...descriptions], feeEur: Eur.toNumber(fee) };
    },
    unsupported: (currency: CurrencyCode): ConversionNote =>
        new UnsupportedConversionNote(currency),
};

export class CurrencyConverter {
    constructor(private readonly rates: RateProvider) {}

    convert(tx: RawTransaction): ConvertedAmount {
        const current = tx.sourceCurrency;
        if (current === EUR_CODE) {
            const fee = tx.sourceFeeCurrency === EUR_CODE ? tx.sourceFee : 0;
            return {
                eur: Eur.fromNumber(tx.sourceAmount + fee),
                note: ConversionNote.eur(fee).toString(),
            };
        }
        try {
            const feeSameCurrent =
                tx.sourceFeeCurrency === current ? tx.sourceFee : 0;
            const rate = this.rates.rate({
                base: EUR_CODE,
                on: tx.date,
                quote: current,
            });
            return {
                eur: Eur.fromNumber((tx.sourceAmount + feeSameCurrent) / rate),
                note: ConversionNote.ecb(current, rate).toString(),
            };
        } catch {
            return {
                eur: null,
                note: ConversionNote.unsupported(current).toString(),
            };
        }
    }
}
