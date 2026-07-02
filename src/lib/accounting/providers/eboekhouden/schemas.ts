import { z } from 'zod';

import {
    type IN_EX_VAT,
    type MUTATION_TYPES,
    type VAT_CODES,
} from '~/lib/accounting/providers/eboekhouden/enums';

const isoDate = z.string().transform((v) => v.slice(0, 10));

const numeric = z.coerce.number();

export const sessionSchema = z.object({
    expiresIn: z.coerce.number(),
    token: z.string(),
});
export type SessionResponse = z.infer<typeof sessionSchema>;

export const ledgerSchema = z.object({
    category: z.string(),
    code: z.string(),
    description: z.string(),
    group: z.string().nullish(),
    id: numeric,
});
export type LedgerResponse = z.infer<typeof ledgerSchema>;

export const ledgerBalanceSchema = z.object({
    balance: numeric.default(0),
    ledgerId: numeric.default(0),
});
export type LedgerBalanceResponse = z.infer<typeof ledgerBalanceSchema>;

export const mutationRowSchema = z.object({
    amount: numeric.default(0),
    description: z.string().nullish(),
    ledgerId: numeric.nullish(),
    vatCode: z.string().nullish(),
});

export const mutationSchema = z.object({
    date: isoDate,
    description: z.string().nullish(),
    id: numeric,
    ledgerId: numeric,
    paymentReference: z.string().nullish(),
    rows: z.array(mutationRowSchema).default([]),
    type: z.coerce.string(),
});
export type MutationResponse = z.infer<typeof mutationSchema>;

export const mutationCreatedSchema = z.object({ id: numeric });

export const relationSchema = z.object({
    code: z.string().nullish(),
    id: numeric,
    name: z.string().default(''),
    type: z.string().nullish(),
});
export type RelationResponse = z.infer<typeof relationSchema>;

export const costCenterSchema = z.object({
    active: z.boolean().default(true),
    description: z.string().default(''),
    id: numeric,
    parentId: numeric.nullish(),
});
export type CostCenterResponse = z.infer<typeof costCenterSchema>;

export const administrationSchema = z.object({
    id: numeric,
    name: z.string().nullish(),
});
export type AdministrationResponse = z.infer<typeof administrationSchema>;

export interface CreateMutationRequestPayload {
    checkPaymentReference?: boolean;
    date: string;
    description?: string;
    entryNumber?: string;
    inExVat?: (typeof IN_EX_VAT)[keyof typeof IN_EX_VAT];
    invoiceNumber?: string;
    ledgerId: number;
    paymentReference?: string;
    relationId?: number;
    rows: CreateMutationRowPayload[];
    termOfPayment?: number;
    type: (typeof MUTATION_TYPES)[keyof typeof MUTATION_TYPES];
}

export interface CreateMutationRowPayload {
    amount: number;
    costCenterId?: number;
    description?: string;
    invoiceNumber?: string;
    ledgerId?: number;
    relationId?: number;
    vatAmount?: number;
    vatCode: (typeof VAT_CODES)[number];
}

export function omitNullish<T extends object>(payload: T): Partial<T> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
        if (v !== null && v !== undefined) out[k] = v;
    }
    return out as Partial<T>;
}

export function unwrapItems<T>(body: unknown, item: z.ZodType<T>): T[] {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        const items = (body as { items?: unknown }).items;
        if (Array.isArray(items)) return items.map((row) => item.parse(row));
        return [];
    }
    if (Array.isArray(body)) return body.map((row) => item.parse(row));
    return [];
}
