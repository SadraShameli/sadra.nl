import { z } from 'zod';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { LedgerId } from '~/lib/accounting/core/ids';
import { MATCH_TYPES } from '~/lib/accounting/core/rules/matcher';
import { BOOKING_DIRECTIONS } from '~/lib/accounting/core/types';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';
import { CredentialKind } from '~/lib/accounting/credentials/registry';

function hasValidAmountRange(v: {
    maxAmount?: null | number;
    minAmount?: null | number;
}): boolean {
    return (
        v.minAmount == null || v.maxAmount == null || v.minAmount <= v.maxAmount
    );
}

function hasValidDateRange(v: {
    dateFrom?: null | string;
    dateTo?: null | string;
}): boolean {
    return v.dateFrom == null || v.dateTo == null || v.dateFrom <= v.dateTo;
}

export const credentialKindSchema = z
    .enum(CredentialKind)
    .refine((id) => CredentialRegistry.instance.get(id) !== undefined, {
        error: (issue) => `Unknown credential kind "${String(issue.input)}"`,
    });

export const credentialMetaSchema = z.record(z.string(), z.unknown());

export const credentialCreateSchema = z
    .object({
        kind: credentialKindSchema,
        label: z.string().min(1).max(64),
        meta: credentialMetaSchema.optional().default({}),
        secret: z.string().optional(),
    })
    .refine(
        (value) => {
            const requiresSecret =
                CredentialRegistry.instance.get(value.kind)?.requiresSecret !==
                false;
            return !requiresSecret || (value.secret?.length ?? 0) >= 8;
        },
        {
            error: 'Secret must be at least 8 characters',
            path: ['secret'],
        },
    );
export type CredentialCreateInput = z.infer<typeof credentialCreateSchema>;

export const credentialUpdateSchema = z.object({
    id: z.uuid(),
    label: z.string().min(1).max(64).optional(),
    meta: credentialMetaSchema.optional(),
    secret: z.string().min(8).optional(),
});
export type CredentialUpdateInput = z.infer<typeof credentialUpdateSchema>;

export const credentialIdSchema = z.object({ id: z.uuid() });

export const ledgerReferenceSchema = z.object({
    id: z.string().min(1).transform(LedgerId),
    label: z.string(),
});

const runPlanFileInputSchema = z.object({
    content: z.string().min(1),
    credentialId: z.uuid(),
});

export const runPlanRequestSchema = z.object({
    accountingCredentialId: z.uuid().optional(),
    apiCredentialIds: z.array(z.uuid()).default([]),
    files: z.array(runPlanFileInputSchema).default([]),
    startDate: isoDateSchema,
});

export const runPushRequestSchema = z.object({
    accountingCredentialId: z.uuid(),
    runId: z.uuid(),
});

export const ruleCreateSchema = z
    .object({
        credentialId: z.uuid(),
        currency: currencyCodeSchema.nullable().optional(),
        dateFrom: isoDateSchema.nullable().optional(),
        dateTo: isoDateSchema.nullable().optional(),
        direction: z.enum(BOOKING_DIRECTIONS),
        display: z.string().min(1).max(128),
        ledger: ledgerReferenceSchema,
        match: z.string().min(1).max(256),
        matchType: z.enum(MATCH_TYPES).optional(),
        maxAmount: z.number().positive().nullable().optional(),
        minAmount: z.number().positive().nullable().optional(),
        taxCode: z.string().min(1).max(32),
    })
    .refine(hasValidAmountRange, {
        error: 'Minimum amount must not exceed maximum amount',
        path: ['minAmount'],
    })
    .refine(hasValidDateRange, {
        error: 'Date-from must not be after date-to',
        path: ['dateFrom'],
    });
export type RuleCreateInput = z.infer<typeof ruleCreateSchema>;

export const ruleUpdateSchema = z
    .object({
        currency: currencyCodeSchema.nullable().optional(),
        dateFrom: isoDateSchema.nullable().optional(),
        dateTo: isoDateSchema.nullable().optional(),
        direction: z.enum(BOOKING_DIRECTIONS).optional(),
        display: z.string().min(1).max(128).optional(),
        id: z.uuid(),
        ledger: ledgerReferenceSchema.optional(),
        match: z.string().min(1).max(256).optional(),
        matchType: z.enum(MATCH_TYPES).optional(),
        maxAmount: z.number().positive().nullable().optional(),
        minAmount: z.number().positive().nullable().optional(),
        taxCode: z.string().min(1).max(32).optional(),
    })
    .refine(hasValidAmountRange, {
        error: 'Minimum amount must not exceed maximum amount',
        path: ['minAmount'],
    })
    .refine(hasValidDateRange, {
        error: 'Date-from must not be after date-to',
        path: ['dateFrom'],
    });
export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;

export const ruleReorderSchema = z.object({
    credentialId: z.uuid(),
    orderedIds: z.array(z.uuid()).min(1),
});
export type RuleReorderInput = z.infer<typeof ruleReorderSchema>;

export const ruleBacktestSchema = z
    .object({
        credentialId: z.uuid(),
        currency: currencyCodeSchema.optional(),
        dateFrom: isoDateSchema.optional(),
        dateTo: isoDateSchema.optional(),
        direction: z.enum(BOOKING_DIRECTIONS),
        from: isoDateSchema,
        match: z.string().min(1).max(256),
        matchType: z.enum(MATCH_TYPES).optional(),
        maxAmount: z.number().positive().optional(),
        minAmount: z.number().positive().optional(),
        to: isoDateSchema,
    })
    .refine(hasValidAmountRange, {
        error: 'Minimum amount must not exceed maximum amount',
        path: ['minAmount'],
    })
    .refine(hasValidDateRange, {
        error: 'Date-from must not be after date-to',
        path: ['dateFrom'],
    });
export type RuleBacktestInput = z.infer<typeof ruleBacktestSchema>;

export const bankAccountUpsertSchema = z.object({
    credentialId: z.uuid(),
    currency: currencyCodeSchema,
    ledger: ledgerReferenceSchema,
});
export type BankAccountUpsertInput = z.infer<typeof bankAccountUpsertSchema>;
