import { describe, expect, it } from 'vitest';

import { PlaneCsvParser } from '~/lib/accounting/providers/plane/csv-parser';

const BOM = String.fromCodePoint(0xfe_ff);

const HEADER =
    'Payment date,Name,Bank account,Total payment,Total payment currency,' +
    'Regular earnings,Regular earnings currency,Reimbursement,' +
    'Reimbursement currency,Status';

function row(fields: {
    amount: string;
    bankAccount: string;
    currency: string;
    date: string;
    status: string;
}): string {
    return (
        `${BOM}${fields.date},Sadra Shameli,${fields.bankAccount},` +
        `${fields.amount},${fields.currency},0.00,,0.00,,${fields.status}`
    );
}

// Mirrors the real export from Plane.com (manage.plane.com), including its
// quirk of repeating a UTF-8 BOM before every row, not just at file start.
const REAL_EXPORT_SAMPLE = [
    HEADER,
    row({
        amount: '3394.00',
        bankAccount: 'Savings (•••• 1714)',
        currency: 'USD',
        date: '2026-07-07',
        status: 'Pending',
    }),
    row({
        amount: '1443.00',
        bankAccount: 'Savings (•••• 1714)',
        currency: 'USD',
        date: '2026-06-29',
        status: 'Paid',
    }),
    row({
        amount: '2419.00',
        bankAccount: 'EUR (•••• 2495)',
        currency: 'USD',
        date: '2026-03-18',
        status: 'Paid',
    }),
].join('\n');

describe('PlaneCsvParser', () => {
    it('parses paid rows into IN transactions using the payer name from meta', () => {
        const parser = new PlaneCsvParser();
        const txns = parser.parse(REAL_EXPORT_SAMPLE, {
            counterpartName: 'Apex Trader Funding',
        });

        expect(txns).toHaveLength(2);
        expect(txns[0]).toMatchObject({
            date: '2026-06-29',
            direction: 'IN',
            merchant: 'Apex Trader Funding',
            sourceAmount: 1443,
            sourceCurrency: 'USD',
            sourceFee: 0,
            sourceFeeCurrency: null,
        });
    });

    it('excludes rows that are not Paid', () => {
        const parser = new PlaneCsvParser();
        const txns = parser.parse(REAL_EXPORT_SAMPLE, {
            counterpartName: 'Apex Trader Funding',
        });

        expect(txns.some((t) => t.date === '2026-07-07')).toBe(false);
    });

    it('uses the payment currency, not the bank account label, even when they differ', () => {
        const parser = new PlaneCsvParser();
        const txns = parser.parse(REAL_EXPORT_SAMPLE, {
            counterpartName: 'Apex Trader Funding',
        });

        const eurLabeledRow = txns.find((t) => t.date === '2026-03-18');
        expect(eurLabeledRow?.sourceCurrency).toBe('USD');
    });

    it('synthesizes a stable txnId from date, bank account, currency, and amount', () => {
        const parser = new PlaneCsvParser();
        const txns = parser.parse(REAL_EXPORT_SAMPLE, {
            counterpartName: 'Apex Trader Funding',
        });

        const ids = new Set(txns.map((t) => t.txnId));
        expect(ids.size).toBe(txns.length);
    });

    it('falls back to a generic merchant name when counterpartName is missing', () => {
        const parser = new PlaneCsvParser();
        const txns = parser.parse(REAL_EXPORT_SAMPLE, {});

        expect(txns[0]?.merchant).toBe('Plane.com payout');
    });

    it('returns an empty array for an empty file', () => {
        const parser = new PlaneCsvParser();
        expect(parser.parse('', { counterpartName: 'X' })).toEqual([]);
    });

    it('throws when an expected column is missing', () => {
        const parser = new PlaneCsvParser();
        expect(() =>
            parser.parse('Payment date,Status\n2026-01-01,Paid', {
                counterpartName: 'X',
            }),
        ).toThrow(/missing expected column/);
    });
});
