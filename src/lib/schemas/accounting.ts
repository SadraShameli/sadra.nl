import { z } from 'zod';

import { getCredentialDescriptor } from '~/lib/accounting/credentials/index';
import { CREDENTIAL_KIND_VALUES } from '~/lib/accounting/credentials/registry';
import {
    BOOKING_DIRECTIONS,
    VAT_CODES,
} from '~/lib/accounting/providers/eboekhouden/enums';

export const credentialKindSchema = z
    .enum(CREDENTIAL_KIND_VALUES)
    .refine((id) => getCredentialDescriptor(id) !== undefined, {
        error: (issue) => `Unknown credential kind "${String(issue.input)}"`,
    });

export const credentialMetaSchema = z.record(z.string(), z.unknown());

export const credentialCreateSchema = z.object({
    kind: credentialKindSchema,
    label: z.string().min(1).max(64),
    meta: credentialMetaSchema.optional().default({}),
    secret: z.string().min(8),
});
export type CredentialCreateInput = z.infer<typeof credentialCreateSchema>;

export const credentialUpdateSchema = z.object({
    id: z.uuid(),
    label: z.string().min(1).max(64).optional(),
    meta: credentialMetaSchema.optional(),
    secret: z.string().min(8).optional(),
});
export type CredentialUpdateInput = z.infer<typeof credentialUpdateSchema>;

export const credentialIdSchema = z.object({ id: z.uuid() });

export const isoDateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const rawTransactionSchema = z.object({
    date: isoDateSchema,
    direction: z.enum(BOOKING_DIRECTIONS),
    merchant: z.string(),
    sourceAmount: z.number(),
    sourceCurrency: z.string().min(1).max(8),
    sourceFee: z.number().default(0),
    sourceFeeCurrency: z.string().min(1).max(8).nullable().default(null),
    sourceId: z.string(),
    txnId: z.string(),
});

export const ledgerRefSchema = z.object({
    id: z.number().int(),
    label: z.string(),
});

export const bookingSchema = z.object({
    amountEur: z.number(),
    bank: ledgerRefSchema,
    counterpartLedger: ledgerRefSchema,
    counterpartName: z.string(),
    date: isoDateSchema,
    direction: z.enum(BOOKING_DIRECTIONS),
    notes: z.array(z.string()),
    txnId: z.string(),
    vatCode: z.enum(VAT_CODES),
});

export const runPlanRequestSchema = z.object({
    accountingCredentialId: z.uuid().optional(),
    apiCredentialIds: z.array(z.uuid()).default([]),
    startDate: isoDateSchema,
    uploadedTransactions: z.array(rawTransactionSchema).default([]),
});

export const runPushRequestSchema = z.object({
    accountingCredentialId: z.uuid(),
    bookings: z.array(bookingSchema).min(1),
});

export const ruleCreateSchema = z.object({
    credentialId: z.uuid(),
    direction: z.enum(BOOKING_DIRECTIONS),
    display: z.string().min(1).max(128),
    ledger: ledgerRefSchema,
    match: z.string().min(1).max(256),
    vatCode: z.enum(VAT_CODES),
});
export type RuleCreateInput = z.infer<typeof ruleCreateSchema>;

export const ruleUpdateSchema = z.object({
    direction: z.enum(BOOKING_DIRECTIONS).optional(),
    display: z.string().min(1).max(128).optional(),
    id: z.uuid(),
    ledger: ledgerRefSchema.optional(),
    match: z.string().min(1).max(256).optional(),
    vatCode: z.enum(VAT_CODES).optional(),
});
export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;

export const bankAccountUpsertSchema = z.object({
    credentialId: z.uuid(),
    currency: z.string().min(1).max(8),
    ledger: ledgerRefSchema,
});
export type BankAccountUpsertInput = z.infer<typeof bankAccountUpsertSchema>;
