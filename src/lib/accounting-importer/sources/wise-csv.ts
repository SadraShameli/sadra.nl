import type { RawTransaction } from '../core/types';

import { csvHeadersInclude, parseCsv, toFloat } from './csv-base';
import { type CsvSource, registerSource } from './source';

const REQUIRED_COLUMNS = [
    'ID',
    'Status',
    'Direction',
    'Created on',
    'Source amount (after fees)',
    'Source currency',
    'Source fee amount',
    'Source fee currency',
    'Target name',
    'Target amount (after fees)',
    'Target currency',
] as const;

interface WiseRow {
    'Created on': string;
    Direction: string;
    ID: string;
    'Source amount (after fees)': string;
    'Source currency': string;
    'Source fee amount': string;
    'Source fee currency': string;
    Status: string;
    'Target name': string;
}

const isoDate = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        throw new TypeError(`Wise CSV: cannot parse date "${raw}"`);
    }
    return parsed.toISOString().slice(0, 10);
};

export const wiseCsvSource: CsvSource = {
    id: 'wise-csv',
    kind: 'csv',
    label: 'Wise CSV export',
    parse(text) {
        const rows = parseCsv<WiseRow>(text);
        const out: RawTransaction[] = [];
        for (const row of rows) {
            if (row.Status !== 'COMPLETED' || row.Direction !== 'OUT') continue;
            out.push({
                date: isoDate(row['Created on']),
                direction: 'OUT',
                merchant: row['Target name'],
                sourceAmount: toFloat(row['Source amount (after fees)']),
                sourceCurrency: row['Source currency'],
                sourceFee: toFloat(row['Source fee amount']),
                sourceFeeCurrency: row['Source fee currency'] || null,
                sourceId: 'wise-csv',
                txnId: row.ID,
            });
        }
        return out;
    },
    supports(headers) {
        return csvHeadersInclude(headers, REQUIRED_COLUMNS);
    },
};

registerSource(wiseCsvSource);
