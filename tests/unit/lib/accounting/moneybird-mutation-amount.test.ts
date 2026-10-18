import { afterEach, describe, expect, it, vi } from 'vitest';

import { MoneybirdClient } from '~/lib/accounting/providers/moneybird/client';
import { MoneybirdSession } from '~/lib/accounting/providers/moneybird/provider';

const purchaseInvoiceJson = {
    currency: 'EUR',
    date: '2026-09-02',
    details: [
        {
            amount_decimal: '3.0',
            ledger_account_id: 'ledger-1',
            price: '100.0',
            tax_rate_id: 'tax-rate-1',
        },
    ],
    id: 'inv-eur',
    payments: [],
    reference: 'REF-EUR',
    total_price_incl_tax: '363.0',
};

const salesInvoiceJson = {
    currency: 'USD',
    date: '2026-09-01',
    details: [
        {
            amount_decimal: '1.0',
            ledger_account_id: 'ledger-2',
            price: '100.0',
            tax_rate_id: 'tax-rate-1',
        },
    ],
    id: 'inv-usd',
    payments: [],
    reference: 'REF-USD',
    total_price_incl_tax: '121.0',
};

function jsonResponse(body: unknown) {
    return { status: 200, text: () => Promise.resolve(JSON.stringify(body)) };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('MoneybirdSession.listMutations amounts', () => {
    it('reports the invoice total in euros and leaves other currencies blank', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((url: URL) => {
                const path = url.pathname;
                if (path.endsWith('/documents/purchase_invoices.json')) {
                    return Promise.resolve(jsonResponse([purchaseInvoiceJson]));
                }
                if (path.endsWith('/external_sales_invoices.json')) {
                    return Promise.resolve(jsonResponse([salesInvoiceJson]));
                }
                throw new Error(`Unexpected request: ${path}`);
            }),
        );

        const session = new MoneybirdSession(
            new MoneybirdClient('tok', 'admin-1'),
        );
        const mutations = await session.listMutations({ limit: 10 });

        expect(
            mutations.map((mutation) => [mutation.externalId, mutation.amount]),
        ).toEqual([
            ['inv-eur', 363],
            ['inv-usd', null],
        ]);
    });
});
