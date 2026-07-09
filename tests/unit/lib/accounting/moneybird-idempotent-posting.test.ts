import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Booking } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { LedgerId } from '~/lib/accounting/core/ids';
import { MoneybirdClient } from '~/lib/accounting/providers/moneybird/client';
import { MoneybirdSession } from '~/lib/accounting/providers/moneybird/provider';

const booking: Booking = {
    amountEur: 50,
    bank: { id: LedgerId('bank-1'), label: 'Wise EUR' },
    counterpartLedger: { id: LedgerId('ledger-1'), label: 'Software' },
    counterpartName: 'Claude',
    date: isoDateSchema.parse('2026-02-01'),
    direction: 'OUT',
    notes: [],
    sourceCurrency: currencyCodeSchema.parse('EUR'),
    taxCode: 'tax-rate-1',
    txnId: 'TX-idempotency',
};

const invoiceJson = (hasPayments: boolean) => ({
    date: '2026-02-01',
    details: [
        {
            ledger_account_id: 'ledger-1',
            price: '50.0',
            tax_rate_id: 'tax-rate-1',
        },
    ],
    id: 'inv-1',
    payments: hasPayments ? [{ id: 'pay-1' }] : [],
    reference: 'TX-idempotency',
});

function jsonResponse(status: number, body: unknown) {
    return { status, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('MoneybirdSession.postBooking idempotency', () => {
    it('does not create a second invoice when a retry finds the first one already exists', async () => {
        let invoiceCreationCount = 0;
        let paymentAttempts = 0;
        let hasCreatedInvoice = false;

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: URL, init?: RequestInit) => {
                const path = url.pathname;
                const method = init?.method ?? 'GET';

                if (
                    method === 'GET' &&
                    path.endsWith('/documents/purchase_invoices.json')
                ) {
                    return jsonResponse(
                        200,
                        hasCreatedInvoice ? [invoiceJson(false)] : [],
                    );
                }
                if (
                    method === 'POST' &&
                    path.endsWith('/documents/purchase_invoices.json')
                ) {
                    invoiceCreationCount += 1;
                    hasCreatedInvoice = true;
                    return jsonResponse(201, invoiceJson(false));
                }
                if (
                    method === 'POST' &&
                    path.endsWith(
                        '/documents/purchase_invoices/inv-1/payments.json',
                    )
                ) {
                    paymentAttempts += 1;
                    if (paymentAttempts === 1) {
                        return jsonResponse(500, {
                            error: 'temporary failure',
                        });
                    }
                    return jsonResponse(201, { id: 'pay-1' });
                }
                if (method === 'GET' && path.endsWith('/contacts.json')) {
                    return jsonResponse(200, []);
                }
                if (method === 'POST' && path.endsWith('/contacts.json')) {
                    return jsonResponse(201, {
                        company_name: 'Claude',
                        id: 'contact-1',
                    });
                }
                throw new Error(`Unexpected request: ${method} ${path}`);
            }),
        );

        const client = new MoneybirdClient('tok', 'admin-1');
        const session = new MoneybirdSession(client);

        await expect(session.postBooking(booking)).rejects.toThrow();
        expect(invoiceCreationCount).toBe(1);
        expect(paymentAttempts).toBe(1);

        const result = await session.postBooking(booking);
        expect(result.externalId).toBe('inv-1');
        expect(invoiceCreationCount).toBe(1);
        expect(paymentAttempts).toBe(2);
    });
});
