import 'server-only';

import type { TaxCodeCatalog } from '~/lib/accounting/core/tax-code';
import type { Booking } from '~/lib/accounting/core/types';
import type { DateBounds } from '~/lib/accounting/providers/date-filter';
import type { InvoiceResourceBase } from '~/lib/accounting/providers/moneybird/resources';
import type { MoneybirdInvoice } from '~/lib/accounting/providers/moneybird/schemas';
import type {
    AccountingProvider,
    ListMutationsOptions,
    OpenSessionOptions,
    PostBookingResult,
    ProviderLedger,
    ProviderMutation,
} from '~/lib/accounting/providers/provider';

import { EUR_CODE } from '~/lib/accounting/core/currency';
import { DateFilter } from '~/lib/accounting/providers/date-filter';
import {
    invoicePayload,
    isPurchaseInvoice,
    paymentPayload,
} from '~/lib/accounting/providers/moneybird/booking';
import { MoneybirdClient } from '~/lib/accounting/providers/moneybird/client';
import { MoneybirdContactResolver } from '~/lib/accounting/providers/moneybird/contact-resolver';
import { MoneybirdTaxCodeCatalog } from '~/lib/accounting/providers/moneybird/enums';
import { InvoiceFilter } from '~/lib/accounting/providers/moneybird/invoice-filter';
import { MoneybirdPage } from '~/lib/accounting/providers/moneybird/page';
import {
    ContactsResource,
    ExternalSalesInvoicesResource,
    LedgerAccountsResource,
    PurchaseInvoicesResource,
    TaxRatesResource,
} from '~/lib/accounting/providers/moneybird/resources';
import { MutationSource } from '~/lib/accounting/providers/moneybird/schemas';
import {
    newestMutationFirst,
    ProviderRegistry,
    ProviderSessionBase,
} from '~/lib/accounting/providers/provider';

interface SourcedInvoice {
    readonly invoice: MoneybirdInvoice;
    readonly source: MutationSource;
}

export class MoneybirdSession extends ProviderSessionBase {
    private readonly contactResolver: MoneybirdContactResolver;
    private readonly externalSalesInvoices: ExternalSalesInvoicesResource;
    private readonly ledgerAccounts: LedgerAccountsResource;
    private readonly purchaseInvoices: PurchaseInvoicesResource;
    private taxCodeCatalog: null | Promise<MoneybirdTaxCodeCatalog> = null;
    private readonly taxRates: TaxRatesResource;

    constructor(client: MoneybirdClient) {
        super();
        this.ledgerAccounts = new LedgerAccountsResource(client);
        this.taxRates = new TaxRatesResource(client);
        this.purchaseInvoices = new PurchaseInvoicesResource(client);
        this.externalSalesInvoices = new ExternalSalesInvoicesResource(client);
        this.contactResolver = new MoneybirdContactResolver(
            new ContactsResource(client),
        );
    }

    private async invoicePostedFor(
        resource: InvoiceResourceBase,
        booking: Booking,
    ): Promise<MoneybirdInvoice | null> {
        const filter = InvoiceFilter.within({
            from: booking.date,
            to: booking.date,
        });
        const invoices = await this.everyPage((page) =>
            resource.list(filter, page),
        );
        return (
            invoices.find((invoice) => invoice.reference === booking.txnId) ??
            null
        );
    }

    private everyPage<T>(
        fetchPage: (page: MoneybirdPage) => Promise<T[]>,
    ): Promise<T[]> {
        return this.paginate(
            (offset) => fetchPage(MoneybirdPage.atOffset(offset)),
            MoneybirdPage.maximumSize,
        );
    }

    private async invoicesWithin(
        bounds: DateBounds,
    ): Promise<SourcedInvoice[]> {
        const filter = InvoiceFilter.within(bounds);
        const [purchases, sales] = await Promise.all([
            this.everyPage((page) => this.purchaseInvoices.list(filter, page)),
            this.everyPage((page) =>
                this.externalSalesInvoices.list(filter, page),
            ),
        ]);
        return [
            ...purchases.map((invoice) => ({
                invoice,
                source: MutationSource.PurchaseInvoice,
            })),
            ...sales.map((invoice) => ({
                invoice,
                source: MutationSource.ExternalSalesInvoice,
            })),
        ];
    }

    private async mutationsWithin(
        bounds: DateBounds,
    ): Promise<ProviderMutation[]> {
        const invoices = await this.invoicesWithin(bounds);
        return invoices
            .map((sourced) => adaptInvoice(sourced))
            .filter((mutation) => mutation !== null);
    }

    close(): Promise<void> {
        return Promise.resolve();
    }

    countMutations(): Promise<null | number> {
        return Promise.resolve(null);
    }

    async latestMutationDate(): Promise<null | string> {
        const newest = await this.collectNewestFirst({}, 1, (slice) =>
            this.invoicesWithin(slice),
        );
        return (
            newest
                .map(({ invoice }) => invoice.date)
                .toSorted((a, b) => a.localeCompare(b))
                .at(-1) ?? null
        );
    }

    async listLedgers(
        options: { category?: string } = {},
    ): Promise<ProviderLedger[]> {
        const all = await this.ledgerAccounts.list();
        const adapted = all.map((ledger) => ({
            category: ledger.accountType,
            code: ledger.rgsCode ?? ledger.id,
            description: ledger.name,
            externalId: ledger.id,
            group: null,
        }));
        return options.category
            ? adapted.filter((l) => l.category === options.category)
            : adapted;
    }

    async listMutations(
        options: ListMutationsOptions,
    ): Promise<ProviderMutation[]> {
        const offset = options.offset ?? 0;
        const found = await this.collectNewestFirst(
            DateFilter.boundsOf(options),
            offset + options.limit,
            (slice) => this.mutationsWithin(slice),
        );
        return found
            .toSorted(newestMutationFirst)
            .slice(offset, offset + options.limit);
    }

    async postBooking(booking: Booking): Promise<PostBookingResult> {
        const resource = isPurchaseInvoice(booking)
            ? this.purchaseInvoices
            : this.externalSalesInvoices;
        const existing = await this.invoicePostedFor(resource, booking);
        const invoice =
            existing ??
            (await resource.create(
                invoicePayload(
                    booking,
                    await this.contactResolver.resolve(booking.counterpartName),
                ),
            ));
        if (!invoice.hasPayment) {
            await resource.createPayment(invoice.id, paymentPayload(booking));
        }
        return { externalId: invoice.id };
    }

    async taxCodes(): Promise<TaxCodeCatalog> {
        this.taxCodeCatalog ??= (async () => {
            const rates = await this.everyPage((page) =>
                this.taxRates.list(page),
            );
            return new MoneybirdTaxCodeCatalog(rates);
        })();
        return this.taxCodeCatalog;
    }
}

function adaptInvoice({
    invoice,
    source,
}: SourcedInvoice): null | ProviderMutation {
    const ledgerId = invoice.details[0]?.ledgerAccountId ?? null;
    return ledgerId
        ? {
              amount:
                  invoice.currency === EUR_CODE
                      ? invoice.totalPriceInclTax
                      : null,
              date: invoice.date,
              description: invoice.reference,
              externalId: invoice.id,
              ledgerId,
              paymentReference: invoice.reference,
              rows: invoice.details.map((detail) => ({
                  amount: detail.price,
                  description: detail.description,
                  ledgerId: detail.ledgerAccountId,
                  vatCode: detail.taxRateId,
              })),
              type: source,
          }
        : null;
}

export const moneybirdProvider: AccountingProvider = {
    id: 'moneybird',
    label: 'Moneybird',
    async openSession(options: OpenSessionOptions): Promise<MoneybirdSession> {
        const administrationId =
            typeof options.meta?.administrationId === 'string'
                ? options.meta.administrationId
                : '';
        const client = new MoneybirdClient(options.secret, administrationId);
        return new MoneybirdSession(client);
    },
};

{
    ProviderRegistry.instance().register(moneybirdProvider);
}
