import type { RawTransaction } from '../core/types';

import { csvHeadersInclude, parseCsv, toFloat } from './csv-base';
import { type CsvSource, registerSource } from './source';

const REQUIRED_COLUMNS = [
    'account',
    'payout_number',
    'date_finalized',
    'amount_usd',
] as const;

interface ApexRow {
    account: string;
    amount_usd: string;
    date_finalized: string;
    payout_number: string;
}

export const apexPayoutCsvSource: CsvSource = {
    id: 'apex-payout-csv',
    kind: 'csv',
    label: 'Apex Trader payout CSV',
    parse(text) {
        const rows = parseCsv<ApexRow>(text);
        const out: RawTransaction[] = [];
        for (const row of rows) {
            const amount = toFloat(row.amount_usd);
            if (amount <= 0) continue;
            out.push({
                date: row.date_finalized.slice(0, 10),
                direction: 'IN',
                merchant: 'apex',
                sourceAmount: amount,
                sourceCurrency: 'USD',
                sourceFee: 0,
                sourceFeeCurrency: null,
                sourceId: 'apex-payout-csv',
                txnId: `${row.account}-P${row.payout_number}`,
            });
        }
        return out;
    },
    supports(headers) {
        return csvHeadersInclude(headers, REQUIRED_COLUMNS);
    },
};

registerSource(apexPayoutCsvSource);
