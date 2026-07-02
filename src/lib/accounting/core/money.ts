import { add, dinero, type Dinero, toDecimal } from 'dinero.js';
import { EUR } from 'dinero.js/currencies';

import type { CurrencyCode, RawTransaction } from '~/lib/accounting/core/types';
import type { RateProvider } from '~/lib/accounting/rates/provider';

import { EUR_CODE } from '~/lib/accounting/core/currency';

export interface ConvertedAmount {
    eur: Eur | null;
    note: string;
}

export interface CurrencyAmount {
    readonly amount: number;
    readonly currency: CurrencyCode;
}

export type Eur = Dinero<number, 'EUR'>;
export const Eur = {
    add: (a: Eur, b: Eur): Eur => add(a, b),
    fromNumber: (n: number): Eur =>
        dinero({ amount: Math.round(n * 10 ** EUR.exponent), currency: EUR }),
    toNumber: (value: Eur): number => Number(toDecimal(value)),
    zero: (): Eur => dinero({ amount: 0, currency: EUR }),
};

export class CurrencyConverter {
    constructor(private readonly rates: RateProvider) {}

    convert(tx: RawTransaction): ConvertedAmount {
        const current = tx.sourceCurrency;
        if (current === EUR_CODE) {
            const fee = tx.sourceFeeCurrency === EUR_CODE ? tx.sourceFee : 0;
            return {
                eur: Eur.fromNumber(tx.sourceAmount + fee),
                note: `EUR+fee${fee.toFixed(2)}`,
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
                note: `${current}@ECB${rate.toFixed(4)}`,
            };
        } catch {
            return { eur: null, note: `unsupported currency ${current}` };
        }
    }
}
