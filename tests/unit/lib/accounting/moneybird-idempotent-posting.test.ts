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

const invoiceJson = () => ({
    date: '2026-02-01',
    details: [
        {
            ledger_account_id: 'ledger-1',
            price: '50.0',
            tax_rate_id: 'tax-rate-1',
        },
    ],
    id: 'inv-1',
    payments: [],
    reference: 'TX-idempotency',
});

function jsonResponse(status: number, body: unknown) {
    return { status, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

function postingFake(existing: readonly ReturnType<typeof invoiceJson>[]) {
    const created: string[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: URL, init?: RequestInit) => {
            const path = url.pathname;
            const method = init?.method ?? 'GET';
            if (
                method === 'GET' &&
                path.endsWith('/documents/purchase_invoices.json')
            ) {
                const period = /period:(\d{8})\.\.(\d{8})/.exec(
                    url.searchParams.get('filter') ?? '',
                );
                return jsonResponse(
                    200,
                    existing.filter((invoice) => {
                        const day = invoice.date.replaceAll('-', '');
                        return (
                            period?.[1] !== undefined &&
                            period[2] !== undefined &&
                            day >= period[1] &&
                            day <= period[2]
                        );
                    }),
                );
            }
            if (
                method === 'POST' &&
                path.endsWith('/documents/purchase_invoices.json')
            ) {
                created.push('inv-new');
                return jsonResponse(201, { ...invoiceJson(), id: 'inv-new' });
            }
            if (method === 'POST' && path.includes('/payments.json')) {
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
    return created;
}

const earlierYearBooking: Booking = {
    ...booking,
    date: isoDateSchema.parse('2024-03-01'),
};

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
                        hasCreatedInvoice ? [invoiceJson()] : [],
                    );
                }
                if (
                    method === 'POST' &&
                    path.endsWith('/documents/purchase_invoices.json')
                ) {
                    invoiceCreationCount += 1;
                    hasCreatedInvoice = true;
                    return jsonResponse(201, invoiceJson());
                }
                if (
                    method === 'POST' &&
                    path.endsWith(
                        '/documents/purchase_invoices/inv-1/payments.json',
                    )
                ) {
                    paymentAttempts += 1;
                    return paymentAttempts === 1
                        ? jsonResponse(500, {
                              error: 'temporary failure',
                          })
                        : jsonResponse(201, { id: 'pay-1' });
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

    it('finds an invoice booked in an earlier year instead of posting it twice', async () => {
        const created = postingFake([
            { ...invoiceJson(), date: '2024-03-01', id: 'inv-2024' },
        ]);
        const result = await new MoneybirdSession(
            new MoneybirdClient('tok', 'admin-1'),
        ).postBooking(earlierYearBooking);
        expect(result.externalId).toBe('inv-2024');
        expect(created).toEqual([]);
    });

    it('never mistakes another reference on the same day for the booking, even when the API ignores reference filters', async () => {
        const created = postingFake([
            {
                ...invoiceJson(),
                date: '2024-03-01',
                id: 'inv-other',
                reference: 'TX-someone-else',
            },
        ]);
        const result = await new MoneybirdSession(
            new MoneybirdClient('tok', 'admin-1'),
        ).postBooking(earlierYearBooking);
        expect(result.externalId).toBe('inv-new');
        expect(created).toEqual(['inv-new']);
    });
});
