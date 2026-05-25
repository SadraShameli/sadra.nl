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
    if (tx.sourceCurrency === 'EUR') {
        const fee = tx.sourceFeeCurrency === 'EUR' ? tx.sourceFee : 0;
        return {
            eur: round2(tx.sourceAmount + fee),
            note: `EUR+fee${fee.toFixed(2)}`,
        };
    }
    if (tx.sourceCurrency === 'USD') {
        const feeUsd = tx.sourceFeeCurrency === 'USD' ? tx.sourceFee : 0;
        const rate = rates.rate({ base: 'EUR', on: tx.date, quote: 'USD' });
        return {
            eur: round2((tx.sourceAmount + feeUsd) / rate),
            note: `USD@ECB${rate.toFixed(4)}`,
        };
    }
    return { eur: null, note: `unsupported currency ${tx.sourceCurrency}` };
}

export { round2 };
