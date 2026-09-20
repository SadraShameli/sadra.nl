import { z } from 'zod';

import type { CreateMutationRequestPayload } from '~/lib/accounting/providers/eboekhouden/schemas';

import { isoDateSchema } from '~/lib/accounting/core/date';
import {
    InExVat,
    MutationType,
    requiresExcludingVat,
    VatCode,
} from '~/lib/accounting/providers/eboekhouden/enums';

const DESCRIPTION_MAX_LENGTH = 50;

export const manualMutationInputSchema = z.object({
    amount: z.coerce.number().positive(),
    date: isoDateSchema,
    description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
    inExVat: z.enum(InExVat).optional(),
    invoiceNumber: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
    ledger: z.coerce.number().int().positive(),
    relationId: z.coerce.number().int().positive().optional(),
    rowDescription: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
    rowLedger: z.coerce.number().int().positive(),
    type: z.enum(MutationType),
    vatCode: z.enum(VatCode),
});
export type ManualMutationInput = z.infer<typeof manualMutationInputSchema>;

export function buildManualMutationPayload(
    input: ManualMutationInput,
): CreateMutationRequestPayload {
    const inExVat =
        input.inExVat ??
        (requiresExcludingVat(input.vatCode)
            ? InExVat.Excluding
            : InExVat.Including);
    return {
        date: input.date,
        description: input.description,
        inExVat,
        invoiceNumber: input.invoiceNumber,
        ledgerId: input.ledger,
        relationId: input.relationId,
        rows: [
            {
                amount: input.amount,
                description: input.rowDescription ?? input.description,
                ledgerId: input.rowLedger,
                vatCode: input.vatCode,
            },
        ],
        type: input.type,
    };
}
