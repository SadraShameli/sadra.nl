import { z } from 'zod';

import { ExternalId, LedgerId } from '~/lib/accounting/core/ids';

export enum ManualPaymentAction {
    BalanceSettlement = 'balance_settlement',
}

export enum MoneybirdAccountType {
    CurrentAssets = 'current_assets',
    CurrentLiabilities = 'current_liabilities',
    DirectCosts = 'direct_costs',
    Equity = 'equity',
    Expenses = 'expenses',
    NonCurrentAssets = 'non_current_assets',
    NonCurrentLiabilities = 'non_current_liabilities',
    OtherIncomeExpenses = 'other_income_expenses',
    Provisions = 'provisions',
    Revenue = 'revenue',
}

export enum MutationSource {
    ExternalSalesInvoice = 'external_sales_invoice',
    PurchaseInvoice = 'purchase_invoice',
}

const moneybirdId = z.coerce.string();

const ledgerId = moneybirdId.transform((value) => LedgerId(value));

const externalId = moneybirdId.transform((value) => ExternalId(value));

export const administrationSchema = z
    .object({
        currency: z.string(),
        id: moneybirdId,
        name: z.string(),
    })
    .transform((raw) => ({
        currency: raw.currency,
        id: raw.id,
        name: raw.name,
    }));
export type MoneybirdAdministration = z.infer<typeof administrationSchema>;

export const ledgerAccountSchema = z
    .object({
        account_type: z.enum(MoneybirdAccountType),
        id: ledgerId,
        name: z.string(),
        rgs_code: z.string().nullish(),
    })
    .transform((raw) => ({
        accountType: raw.account_type,
        id: raw.id,
        name: raw.name,
        rgsCode: raw.rgs_code ?? null,
    }));
export type MoneybirdLedgerAccount = z.infer<typeof ledgerAccountSchema>;

export const taxRateSchema = z
    .object({
        id: moneybirdId,
        name: z.string(),
        percentage: z.coerce.number(),
        tax_rate_type: z.string(),
    })
    .transform((raw) => ({
        id: raw.id,
        name: raw.name,
        percentage: raw.percentage,
        taxRateType: raw.tax_rate_type,
    }));
export type MoneybirdTaxRate = z.infer<typeof taxRateSchema>;

export const contactSchema = z
    .object({
        company_name: z.string().nullish(),
        id: moneybirdId,
    })
    .transform((raw) => ({
        companyName: raw.company_name ?? null,
        id: raw.id,
    }));
export type MoneybirdContact = z.infer<typeof contactSchema>;

const invoiceDetailSchema = z
    .object({
        description: z.string().nullish(),
        ledger_account_id: ledgerId.nullish(),
        price: z.coerce.number(),
        tax_rate_id: moneybirdId.nullish(),
    })
    .transform((raw) => ({
        description: raw.description ?? null,
        ledgerAccountId: raw.ledger_account_id ?? null,
        price: raw.price,
        taxRateId: raw.tax_rate_id ?? null,
    }));

export const invoiceSchema = z
    .object({
        date: z.string(),
        details: z.array(invoiceDetailSchema).default([]),
        id: externalId,
        payments: z.array(z.unknown()).default([]),
        reference: z.string().nullish(),
    })
    .transform((raw) => ({
        date: raw.date,
        details: raw.details,
        hasPayment: raw.payments.length > 0,
        id: raw.id,
        reference: raw.reference ?? null,
    }));
export interface CreateContactRequest {
    companyName: string;
}

export interface CreateInvoiceRequest {
    contactId?: string;
    date: string;
    detailsAttributes: DetailAttribute[];
    reference: string;
}

export interface CreatePaymentRequest {
    ledgerAccountId: LedgerId;
    manualPaymentAction: ManualPaymentAction;
    paymentDate: string;
    price: number;
}

export interface DetailAttribute {
    description: string;
    ledgerAccountId: LedgerId;
    price: number;
    taxRateId: string;
}

export type MoneybirdInvoice = z.infer<typeof invoiceSchema>;
