import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IsoDate } from '~/lib/accounting/core/date';
import { MoneybirdClient } from '~/lib/accounting/providers/moneybird/client';
import { MoneybirdSession } from '~/lib/accounting/providers/moneybird/provider';

import {
    type FakeInvoice,
    FakeMoneybirdApi,
    type FakeMoneybirdLedger,
} from './moneybird-fake-api';

const TODAY = new Date('2026-10-18T12:00:00');
const FIRST_INVOICE_DAY = IsoDate.parse('2024-03-01');
const LAST_INVOICE_DAY = IsoDate.parse('2026-10-10');
const PURCHASE_ID_BASE = 1_000_000;
const SALES_ID_BASE = 2_000_000;
const SALES_EVERY_DAYS = 2;
const PAGE = 25;
const API_PAGE_LIMIT = 100;
const PER_PAGE_PARAMETER = 'per_page';

function invoicesEvery(days: number, idBase: number): FakeInvoice[] {
    const invoices: FakeInvoice[] = [];
    for (
        let date = FIRST_INVOICE_DAY;
        IsoDate.isSameOrAfter(LAST_INVOICE_DAY, date);
        date = IsoDate.addDays(date, days)
    ) {
        invoices.push({ date, id: String(idBase + invoices.length) });
    }
    return invoices;
}

const LEDGER: FakeMoneybirdLedger = {
    externalSalesInvoices: invoicesEvery(SALES_EVERY_DAYS, SALES_ID_BASE),
    purchaseInvoices: invoicesEvery(1, PURCHASE_ID_BASE),
};

const ALL_INVOICES = [
    ...LEDGER.purchaseInvoices,
    ...LEDGER.externalSalesInvoices,
];

function newestFirst(invoices: readonly FakeInvoice[]): string[] {
    return invoices
        .toSorted((a, b) =>
            a.date === b.date
                ? b.id.localeCompare(a.id, undefined, { numeric: true })
                : b.date.localeCompare(a.date),
        )
        .map((invoice) => invoice.id);
}

function openSession(): MoneybirdSession {
    return new MoneybirdSession(new MoneybirdClient('tok', 'admin-1'));
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('Moneybird listMutations', () => {
    it('starts with the newest invoices of the whole history in two requests', async () => {
        const api = FakeMoneybirdApi.serve(LEDGER);
        const session = openSession();

        const firstPage = await session.listMutations({ limit: PAGE });
        const firstPageRequests = api.requests.length;
        const secondPage = await session.listMutations({
            limit: PAGE,
            offset: PAGE,
        });

        expect(firstPage[0]?.date).toBe(LAST_INVOICE_DAY);
        expect(
            [...firstPage, ...secondPage].map((row) => row.externalId),
        ).toEqual(newestFirst(ALL_INVOICES).slice(0, PAGE * 2));
        expect(firstPageRequests).toBe(2);
    });

    it('reaches invoices from earlier years across every page of both endpoints', async () => {
        const api = FakeMoneybirdApi.serve(LEDGER);
        const session = openSession();

        const everything = await session.listMutations({ limit: 10_000 });

        expect(everything.map((row) => row.externalId)).toEqual(
            newestFirst(ALL_INVOICES),
        );
        expect(everything.at(-1)?.date).toBe(FIRST_INVOICE_DAY);
        expect(
            api.requests.every(
                (url) =>
                    url.searchParams.get(PER_PAGE_PARAMETER) ===
                    String(API_PAGE_LIMIT),
            ),
        ).toBe(true);
        expect(new Set(api.requests.map((url) => url.href)).size).toBe(
            api.requests.length,
        );
    });

    it('asks Moneybird for a date range across pages instead of filtering this year afterwards', async () => {
        const api = FakeMoneybirdApi.serve(LEDGER);
        const session = openSession();

        const found = await session.listMutations({
            dateFrom: '2025-01-01',
            dateTo: '2025-12-31',
            limit: 1000,
        });

        expect(found.map((row) => row.externalId)).toEqual(
            newestFirst(
                ALL_INVOICES.filter(
                    (invoice) =>
                        invoice.date >= '2025-01-01' &&
                        invoice.date <= '2025-12-31',
                ),
            ),
        );
        expect(
            api.periods.every(
                (period) =>
                    period.from >= '20250101' && period.to <= '20251231',
            ),
        ).toBe(true);
        expect(api.requests).toHaveLength(8);
    });
});

describe('Moneybird latestMutationDate', () => {
    it('reads the latest invoice date with one request per endpoint', async () => {
        const api = FakeMoneybirdApi.serve(LEDGER);

        const latest = await openSession().latestMutationDate();

        expect(latest).toBe(LAST_INVOICE_DAY);
        expect(api.requests).toHaveLength(2);
    });

    it('finds a latest invoice from an earlier year', async () => {
        const api = FakeMoneybirdApi.serve({
            externalSalesInvoices: [{ date: '2024-02-03', id: '2000001' }],
            purchaseInvoices: [
                { date: '2023-05-06', id: '1000001' },
                { date: '2025-11-20', id: '1000002' },
            ],
        });

        const latest = await openSession().latestMutationDate();

        expect(latest).toBe('2025-11-20');
        expect(api.requests).toHaveLength(4);
    });

    it('counts an invoice dated next year as the latest', async () => {
        FakeMoneybirdApi.serve({
            ...LEDGER,
            externalSalesInvoices: [
                ...LEDGER.externalSalesInvoices,
                { date: '2027-01-15', id: '2999999' },
            ],
        });

        const latest = await openSession().latestMutationDate();

        expect(latest).toBe('2027-01-15');
    });

    it('reports no date for an administration without invoices', async () => {
        FakeMoneybirdApi.serve({
            externalSalesInvoices: [],
            purchaseInvoices: [],
        });

        const latest = await openSession().latestMutationDate();

        expect(latest).toBeNull();
    });
});
