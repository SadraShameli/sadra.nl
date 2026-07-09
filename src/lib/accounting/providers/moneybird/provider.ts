import 'server-only';

import type { TaxCodeCatalog } from '~/lib/accounting/core/tax-code';
import type { Booking } from '~/lib/accounting/core/types';
import type { MoneybirdInvoice } from '~/lib/accounting/providers/moneybird/schemas';
import type {
    AccountingProvider,
    ListMutationsOptions,
    OpenSessionOptions,
    PostBookingResult,
    ProviderLedger,
    ProviderMutation,
} from '~/lib/accounting/providers/provider';

import {
    invoicePayload,
    isPurchaseInvoice,
    paymentPayload,
} from '~/lib/accounting/providers/moneybird/booking';
import { MoneybirdClient } from '~/lib/accounting/providers/moneybird/client';
import { MoneybirdContactResolver } from '~/lib/accounting/providers/moneybird/contact-resolver';
import { MoneybirdTaxCodeCatalog } from '~/lib/accounting/providers/moneybird/enums';
import {
    ContactsResource,
    ExternalSalesInvoicesResource,
    LedgerAccountsResource,
    PurchaseInvoicesResource,
    TaxRatesResource,
} from '~/lib/accounting/providers/moneybird/resources';
import { MutationSource } from '~/lib/accounting/providers/moneybird/schemas';
import {
    ProviderRegistry,
    ProviderSessionBase,
} from '~/lib/accounting/providers/provider';

const TAX_RATE_PAGE_SIZE = 100;

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

    close(): Promise<void> {
        return Promise.resolve();
    }

    async latestMutationDate(): Promise<null | string> {
        const [purchases, sales] = await Promise.all([
            this.purchaseInvoices.list(),
            this.externalSalesInvoices.list(),
        ]);
        const dates = [...purchases, ...sales].map((invoice) => invoice.date);
        if (dates.length === 0) return null;
        return dates.toSorted((a, b) => a.localeCompare(b)).at(-1) ?? null;
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
        if (options.category) {
            return adapted.filter((l) => l.category === options.category);
        }
        return adapted;
    }

    async listMutations(
        options: ListMutationsOptions,
    ): Promise<ProviderMutation[]> {
        const [purchases, sales] = await Promise.all([
            this.purchaseInvoices.list(),
            this.externalSalesInvoices.list(),
        ]);
        let adapted = [
            ...purchases.map((invoice) =>
                adaptInvoice(invoice, MutationSource.PurchaseInvoice),
            ),
            ...sales.map((invoice) =>
                adaptInvoice(invoice, MutationSource.ExternalSalesInvoice),
            ),
        ].filter((mutation) => mutation !== null);
        if (options.dateFrom) {
            const from = options.dateFrom;
            adapted = adapted.filter((m) => m.date >= from);
        }
        if (options.dateTo) {
            const to = options.dateTo;
            adapted = adapted.filter((m) => m.date <= to);
        }
        const sorted = adapted.toSorted((a, b) =>
            a.date === b.date ? 0 : a.date < b.date ? 1 : -1,
        );
        const offset = options.offset ?? 0;
        return sorted.slice(offset, offset + options.limit);
    }

    async postBooking(booking: Booking): Promise<PostBookingResult> {
        const resource = isPurchaseInvoice(booking)
            ? this.purchaseInvoices
            : this.externalSalesInvoices;
        const existing = await resource.findByReference(booking.txnId);
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
            const rates = await this.paginate(
                (offset) =>
                    this.taxRates.list({
                        page: offset / TAX_RATE_PAGE_SIZE + 1,
                        perPage: TAX_RATE_PAGE_SIZE,
                    }),
                TAX_RATE_PAGE_SIZE,
            );
            return new MoneybirdTaxCodeCatalog(rates);
        })();
        return this.taxCodeCatalog;
    }
}

function adaptInvoice(
    invoice: MoneybirdInvoice,
    type: MutationSource,
): null | ProviderMutation {
    const ledgerId = invoice.details[0]?.ledgerAccountId ?? null;
    if (!ledgerId) return null;
    return {
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
        type,
    };
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

ProviderRegistry.instance().register(moneybirdProvider);
