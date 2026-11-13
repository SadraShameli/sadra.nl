import { describe, expect, it } from 'vitest';

import {
    buildManualMutationPayload,
    manualMutationInputSchema,
} from '~/lib/accounting/providers/eboekhouden/manual-mutation';

const baseInput = {
    amount: '100',
    date: '2026-03-10',
    ledger: '1',
    rowLedger: '2',
    type: '5',
    vatCode: 'BU_EU_VERK',
};

describe('manual mutation payment reference', () => {
    it('sets the reference and turns on duplicate checking when given', () => {
        const payload = buildManualMutationPayload(
            manualMutationInputSchema.parse({
                ...baseInput,
                paymentReference: 'plane:2026-03-10',
            }),
        );

        expect(payload.paymentReference).toBe('plane:2026-03-10');
        expect(payload.checkPaymentReference).toBe(true);
    });

    it('leaves both out when no reference is given', () => {
        const payload = buildManualMutationPayload(
            manualMutationInputSchema.parse(baseInput),
        );

        expect(payload.paymentReference).toBeUndefined();
        expect(payload.checkPaymentReference).toBeUndefined();
    });

    it('rejects a reference longer than 50 chars', () => {
        expect(
            manualMutationInputSchema.safeParse({
                ...baseInput,
                paymentReference: 'x'.repeat(51),
            }).success,
        ).toBe(false);
    });
});
