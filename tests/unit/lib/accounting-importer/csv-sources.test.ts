import { describe, expect, it } from 'vitest';

import { apexPayoutCsvSource } from '~/lib/accounting-importer/sources/apex-payout-csv';
import { sniffCsvHeaders } from '~/lib/accounting-importer/sources/csv-base';
import { detectCsvSource } from '~/lib/accounting-importer/sources/source';
import { wiseCsvSource } from '~/lib/accounting-importer/sources/wise-csv';

const WISE_CSV = `ID,Status,Direction,Created on,Source amount (after fees),Source currency,Source fee amount,Source fee currency,Target name,Target amount (after fees),Target currency
TX-1,COMPLETED,OUT,2026-01-15T10:00:00Z,123.45,USD,1.50,USD,Anthropic Ireland,120.00,EUR
TX-2,COMPLETED,IN,2026-01-16T10:00:00Z,50.00,EUR,0,EUR,Refund Co,50,EUR
TX-3,FAILED,OUT,2026-01-17T10:00:00Z,99,USD,1,USD,Should Skip,98,USD
`;

const APEX_CSV = `account,payout_number,date_finalized,amount_usd
A123,1,2026-01-10,1500.00
A123,2,2026-02-10,0
A124,1,2026-02-15,"$2,500.00"
`;

describe('wise CSV source', () => {
    it('is auto-detected by header sniffing', () => {
        const detected = detectCsvSource(sniffCsvHeaders(WISE_CSV));
        expect(detected?.id).toBe('wise-csv');
    });

    it('parses only COMPLETED + OUT rows', () => {
        const txns = wiseCsvSource.parse(WISE_CSV);
        expect(txns).toHaveLength(1);
        expect(txns[0]).toMatchObject({
            date: '2026-01-15',
            direction: 'OUT',
            merchant: 'Anthropic Ireland',
            sourceAmount: 123.45,
            sourceCurrency: 'USD',
            sourceFee: 1.5,
            sourceFeeCurrency: 'USD',
            txnId: 'TX-1',
        });
    });
});

describe('apex payout CSV source', () => {
    it('is auto-detected by header sniffing', () => {
        const detected = detectCsvSource(sniffCsvHeaders(APEX_CSV));
        expect(detected?.id).toBe('apex-payout-csv');
    });

    it('strips $ and , then drops non-positive amounts', () => {
        const txns = apexPayoutCsvSource.parse(APEX_CSV);
        expect(txns).toHaveLength(2);
        expect(txns[0]).toMatchObject({
            direction: 'IN',
            merchant: 'apex',
            sourceAmount: 1500,
            sourceCurrency: 'USD',
            txnId: 'A123-P1',
        });
        expect(txns[1]).toMatchObject({
            sourceAmount: 2500,
            txnId: 'A124-P1',
        });
    });
});
