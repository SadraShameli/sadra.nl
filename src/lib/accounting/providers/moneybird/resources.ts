import 'server-only';
import { z } from 'zod';

import type { ExternalId } from '~/lib/accounting/core/ids';
import type { MoneybirdClient } from '~/lib/accounting/providers/moneybird/client';

import {
    contactSchema,
    type CreateContactRequest,
    type CreateInvoiceRequest,
    type CreatePaymentRequest,
    invoiceSchema,
    ledgerAccountSchema,
    type MoneybirdContact,
    type MoneybirdInvoice,
    type MoneybirdLedgerAccount,
    type MoneybirdTaxRate,
    taxRateSchema,
} from '~/lib/accounting/providers/moneybird/schemas';

export class ContactsResource {
    constructor(private readonly client: MoneybirdClient) {}

    async create(input: CreateContactRequest): Promise<MoneybirdContact> {
        const body = await this.client.request('POST', '/contacts.json', {
            json: { contact: { company_name: input.companyName } },
        });
        return contactSchema.parse(body);
    }

    async findByCompanyName(
        companyName: string,
    ): Promise<MoneybirdContact | null> {
        const body = await this.client.request('GET', '/contacts.json', {
            params: { query: companyName },
        });
        const matches = z.array(contactSchema).parse(body);
        return (
            matches.find((c) => c.companyName === companyName) ??
            matches[0] ??
            null
        );
    }
}

export abstract class InvoiceResourceBase {
    protected abstract readonly basePath: string;
    protected abstract readonly invoiceKey: string;

    constructor(protected readonly client: MoneybirdClient) {}

    async create(input: CreateInvoiceRequest): Promise<MoneybirdInvoice> {
        const body = await this.client.request('POST', this.basePath, {
            json: {
                [this.invoiceKey]: {
                    contact_id: input.contactId,
                    date: input.date,
                    details_attributes: input.detailsAttributes.map(
                        (detail) => ({
                            description: detail.description,
                            ledger_account_id: detail.ledgerAccountId,
                            price: detail.price,
                            tax_rate_id: detail.taxRateId,
                        }),
                    ),
                    reference: input.reference,
                },
            },
        });
        return invoiceSchema.parse(body);
    }

    async createPayment(
        invoiceId: ExternalId,
        input: CreatePaymentRequest,
    ): Promise<void> {
        await this.client.request('POST', this.paymentsPath(invoiceId), {
            json: {
                payment: {
                    ledger_account_id: input.ledgerAccountId,
                    manual_payment_action: input.manualPaymentAction,
                    payment_date: input.paymentDate,
                    price: input.price,
                },
            },
        });
    }

    async findByReference(reference: string): Promise<MoneybirdInvoice | null> {
        const body = await this.client.request('GET', this.basePath, {
            params: { filter: `reference:${reference}` },
        });
        const matches = z.array(invoiceSchema).parse(body);
        return matches[0] ?? null;
    }

    async list(options: { period?: string } = {}): Promise<MoneybirdInvoice[]> {
        const body = await this.client.request('GET', this.basePath, {
            params: options.period
                ? { filter: `period:${options.period}` }
                : {},
        });
        return z.array(invoiceSchema).parse(body);
    }

    protected abstract paymentsPath(invoiceId: ExternalId): string;
}

export class ExternalSalesInvoicesResource extends InvoiceResourceBase {
    protected readonly basePath = '/external_sales_invoices.json';
    protected readonly invoiceKey = 'external_sales_invoice';

    protected paymentsPath(invoiceId: ExternalId): string {
        return `/external_sales_invoices/${invoiceId}/payments.json`;
    }
}

export class LedgerAccountsResource {
    constructor(private readonly client: MoneybirdClient) {}

    async list(): Promise<MoneybirdLedgerAccount[]> {
        const body = await this.client.request('GET', '/ledger_accounts.json');
        return z.array(ledgerAccountSchema).parse(body);
    }
}

export class PurchaseInvoicesResource extends InvoiceResourceBase {
    protected readonly basePath = '/documents/purchase_invoices.json';
    protected readonly invoiceKey = 'purchase_invoice';

    protected paymentsPath(invoiceId: ExternalId): string {
        return `/documents/purchase_invoices/${invoiceId}/payments.json`;
    }
}

export class TaxRatesResource {
    constructor(private readonly client: MoneybirdClient) {}

    async list(options: {
        page: number;
        perPage: number;
    }): Promise<MoneybirdTaxRate[]> {
        const body = await this.client.request('GET', '/tax_rates.json', {
            params: {
                page: String(options.page),
                per_page: String(options.perPage),
            },
        });
        return z.array(taxRateSchema).parse(body);
    }
}
