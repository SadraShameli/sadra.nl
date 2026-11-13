import { describe, expect, it } from 'vitest';

import { RiseCsvParser } from '~/lib/accounting/providers/rise/csv-parser';

const HEADER = 'Date,Description,Amount';

const PAID =
    '2025/11/18 21:30:21,Paid from info@myfundedfx.com riseid: 0x9f28BaC1f793790dd3b0c2f8945F7cA28874f7A6 on tx: 0x7c3a29d23fd388ea5899fd36f308c7e20a1cd44f1045c4236bac220570fda819,800.00';
const WITHDRAW =
    '2025/11/18 22:04:37,Withdraw on ramp RisePayRampUSDC to address 0x90CAed2922EbeA7B627E731D2070eBac1a59c826 on tx: 0x9c21bdf79f276c5cf674b1d2a65fa4d78c0c4877a200da59f7f91a2a7287a1f5,-790.00';

describe('RiseCsvParser', () => {
    it('turns a Paid from row into an incoming USD transaction', () => {
        const txns = new RiseCsvParser().parse([HEADER, PAID].join('\n'));

        expect(txns).toEqual([
            {
                date: '2025-11-18',
                direction: 'IN',
                merchant: 'info@myfundedfx.com',
                sourceAmount: 800,
                sourceCurrency: 'USD',
                sourceFee: 0,
                sourceFeeCurrency: null,
                sourceId: 'rise-csv',
                txnId: 'rise:0x7c3a29d23fd388ea5899fd36f308c7e20a1cd44f1045c4236bac220570fda819',
            },
        ]);
    });

    it('ignores withdrawals so moving money out is never booked as income', () => {
        const txns = new RiseCsvParser().parse(
            [HEADER, WITHDRAW, PAID].join('\n'),
        );

        expect(txns).toHaveLength(1);
        expect(txns[0]?.sourceAmount).toBe(800);
    });

    it('falls back to a date, payer and amount txnId when the tx hash is absent', () => {
        const txns = new RiseCsvParser().parse(
            [
                HEADER,
                '2026/11/05 10:00:00,Paid from payer@example.com,1948.98',
            ].join('\n'),
        );

        expect(txns[0]?.txnId).toBe(
            'rise:2026-11-05:payer@example.com:1948.98',
        );
    });

    it('strips a byte order mark before reading the header', () => {
        const bom = String.fromCodePoint(0xfe_ff);
        const txns = new RiseCsvParser().parse(`${bom}${HEADER}\n${PAID}`);

        expect(txns).toHaveLength(1);
    });

    it('returns an empty array for an empty file', () => {
        expect(new RiseCsvParser().parse('')).toEqual([]);
    });

    it('throws when an expected column is missing', () => {
        expect(() =>
            new RiseCsvParser().parse(
                'Date,Description\n2025/11/18,Paid from a',
            ),
        ).toThrow(/Amount/);
    });
});
