import type { RateProvider } from '../rates/provider';
import type { RawTransaction } from './types';

export interface ConvertedAmount {
    eur: Eur | null;
    note: string;
}

export type Eur = number;

const round2 = (value: number): number => Math.round(value * 100) / 100;
export function convertToEur(
    tx: RawTransaction,
    rates: RateProvider,
): ConvertedAmount {
    const cur = tx.sourceCurrency;
    if (cur === 'EUR') {
        const fee = tx.sourceFeeCurrency === 'EUR' ? tx.sourceFee : 0;
        return {
            eur: round2(tx.sourceAmount + fee),
            note: `EUR+fee${fee.toFixed(2)}`,
        };
    }
    try {
        const feeSameCur = tx.sourceFeeCurrency === cur ? tx.sourceFee : 0;
        const rate = rates.rate({ base: 'EUR', on: tx.date, quote: cur });
        return {
            eur: round2((tx.sourceAmount + feeSameCur) / rate),
            note: `${cur}@ECB${rate.toFixed(4)}`,
        };
    } catch {
        return { eur: null, note: `unsupported currency ${cur}` };
    }
}

export { round2 };
