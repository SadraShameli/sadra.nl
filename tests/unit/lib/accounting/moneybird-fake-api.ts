import { vi } from 'vitest';
import { z } from 'zod';

const DEFAULT_PER_PAGE = 50;
const MAXIMUM_PER_PAGE = 100;
const FIRST_PAGE = 1;
const TERM_SEPARATOR = ',';
const KEY_SEPARATOR = ':';
const CUSTOM_PERIOD = /^(?<from>\d{8})\.\.(?<to>\d{8})$/;
const DOCUMENTED_DEFAULT_FILTER = 'period:this_year';

enum FakeFilterKey {
    Period = 'period',
    State = 'state',
}

enum FakeInvoiceEndpoint {
    ExternalSalesInvoices = '/external_sales_invoices.json',
    PurchaseInvoices = '/documents/purchase_invoices.json',
}

enum FakeNamedPeriod {
    ThisYear = 'this_year',
}

enum FakeQueryKey {
    Filter = 'filter',
    Page = 'page',
    PerPage = 'per_page',
    Sort = 'sort',
}

enum FakeSort {
    DateAscending = 'date_asc',
    DateDescending = 'date_desc',
}

enum FakeState {
    All = 'all',
}

export interface FakeInvoice {
    readonly currency?: string;
    readonly date: string;
    readonly id: string;
    readonly totalPriceInclTax?: string;
}

export interface FakeMoneybirdLedger {
    readonly externalSalesInvoices: readonly FakeInvoice[];
    readonly purchaseInvoices: readonly FakeInvoice[];
}

export interface FakePeriod {
    readonly from: string;
    readonly to: string;
}

export class FakeMoneybirdApi {
    static serve(ledger: FakeMoneybirdLedger): FakeMoneybirdApi {
        const api = new FakeMoneybirdApi(ledger);
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(api.respond(input)),
        );
        return api;
    }

    readonly periods: FakePeriod[] = [];

    readonly requests: URL[] = [];

    constructor(private readonly ledger: FakeMoneybirdLedger) {}

    private page(url: URL, invoices: readonly FakeInvoice[]): object[] {
        const period = periodOf(url.searchParams.get(FakeQueryKey.Filter));
        this.periods.push(period);
        const perPage = Number(
            url.searchParams.get(FakeQueryKey.PerPage) ?? DEFAULT_PER_PAGE,
        );
        if (perPage > MAXIMUM_PER_PAGE) {
            throw new Error(
                `per_page ${perPage} is above the documented maximum of ${MAXIMUM_PER_PAGE}`,
            );
        }
        const page = Number(
            url.searchParams.get(FakeQueryKey.Page) ?? FIRST_PAGE,
        );
        const start = (page - FIRST_PAGE) * perPage;
        return invoices
            .filter(
                (invoice) =>
                    compactDate(invoice.date) >= period.from &&
                    compactDate(invoice.date) <= period.to,
            )
            .slice(start, start + perPage)
            .map((invoice) => invoiceJson(invoice));
    }

    respond(input: Request | string | URL): Response {
        const url = new URL(input instanceof Request ? input.url : input);
        this.requests.push(url);
        if (url.pathname.endsWith(FakeInvoiceEndpoint.PurchaseInvoices)) {
            const sort = z
                .enum(FakeSort)
                .parse(
                    url.searchParams.get(FakeQueryKey.Sort) ??
                        FakeSort.DateDescending,
                );
            const sorted = sortedByDate(this.ledger.purchaseInvoices, sort);
            return Response.json(this.page(url, sorted));
        }
        if (url.pathname.endsWith(FakeInvoiceEndpoint.ExternalSalesInvoices)) {
            if (url.searchParams.has(FakeQueryKey.Sort)) {
                throw new Error(
                    'Moneybird documents no sort parameter for external sales invoices',
                );
            }
            return Response.json(
                this.page(url, this.ledger.externalSalesInvoices),
            );
        }
        throw new Error(`Unexpected request to ${url.pathname}`);
    }
}

function compactDate(date: string): string {
    return date.replaceAll('-', '');
}

function invoiceJson(invoice: FakeInvoice): object {
    return {
        currency: invoice.currency ?? 'EUR',
        date: invoice.date,
        details: [
            {
                ledger_account_id: 'ledger-1',
                price: '100.0',
                tax_rate_id: 'tax-rate-1',
            },
        ],
        id: invoice.id,
        payments: [],
        reference: invoice.id,
        total_price_incl_tax: invoice.totalPriceInclTax ?? '121.0',
    };
}

function periodOf(filter: null | string): FakePeriod {
    const terms = new Map(
        (filter ?? DOCUMENTED_DEFAULT_FILTER)
            .split(TERM_SEPARATOR)
            .map((term) => {
                const [key = '', ...value] = term.split(KEY_SEPARATOR);
                return [
                    z.enum(FakeFilterKey).parse(key),
                    value.join(KEY_SEPARATOR),
                ] as const;
            }),
    );
    const state = terms.get(FakeFilterKey.State);
    if (state !== undefined) z.enum(FakeState).parse(state);
    const period = terms.get(FakeFilterKey.Period) ?? FakeNamedPeriod.ThisYear;
    const custom = CUSTOM_PERIOD.exec(period)?.groups;
    if (custom?.from !== undefined && custom.to !== undefined) {
        return { from: custom.from, to: custom.to };
    }
    z.enum(FakeNamedPeriod).parse(period);
    const year = String(new Date().getFullYear());
    return { from: `${year}0101`, to: `${year}1231` };
}

function sortedByDate(
    invoices: readonly FakeInvoice[],
    sort: FakeSort,
): FakeInvoice[] {
    const direction = sort === FakeSort.DateDescending ? -1 : 1;
    return invoices.toSorted(
        (a, b) =>
            direction *
            (a.date === b.date
                ? a.id.localeCompare(b.id, undefined, { numeric: true })
                : a.date.localeCompare(b.date)),
    );
}
