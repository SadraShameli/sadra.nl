import { describe, expect, it } from 'vitest';

import {
    InExVat,
    MutationType,
    VatCode,
} from '~/lib/accounting/providers/eboekhouden/enums';
import {
    buildManualMutationPayload,
    manualMutationInputSchema,
} from '~/lib/accounting/providers/eboekhouden/manual-mutation';

const baseInput = {
    amount: '53.99',
    date: '2026-08-31',
    invoiceNumber: 'NL697PDFAEUD',
    ledger: '1300',
    rowLedger: '4200',
    type: MutationType.GeneralJournal,
    vatCode: VatCode.HoogInk21,
};

describe('manualMutationInputSchema', () => {
    it('coerces string amount/ledger args into numbers', () => {
        const parsed = manualMutationInputSchema.parse(baseInput);
        expect(parsed.amount).toBe(53.99);
        expect(parsed.ledger).toBe(1300);
        expect(parsed.rowLedger).toBe(4200);
    });

    it('rejects a non-positive amount', () => {
        expect(
            manualMutationInputSchema.safeParse({ ...baseInput, amount: '0' })
                .success,
        ).toBe(false);
    });

    it('rejects an invalid date format', () => {
        expect(
            manualMutationInputSchema.safeParse({
                ...baseInput,
                date: '31-08-2026',
            }).success,
        ).toBe(false);
    });

    it('rejects an unknown VAT code', () => {
        expect(
            manualMutationInputSchema.safeParse({
                ...baseInput,
                vatCode: 'NOT_A_CODE',
            }).success,
        ).toBe(false);
    });

    it('rejects a description longer than 50 chars', () => {
        expect(
            manualMutationInputSchema.safeParse({
                ...baseInput,
                description: 'x'.repeat(51),
            }).success,
        ).toBe(false);
    });
});

describe('buildManualMutationPayload', () => {
    it('defaults inExVat to Including for a domestic-VAT purchase code', () => {
        const input = manualMutationInputSchema.parse(baseInput);
        expect(buildManualMutationPayload(input).inExVat).toBe(
            InExVat.Including,
        );
    });

    it('defaults inExVat to Excluding for a reverse-charge/EU purchase code', () => {
        const input = manualMutationInputSchema.parse({
            ...baseInput,
            vatCode: VatCode.BiEuInk,
        });
        expect(buildManualMutationPayload(input).inExVat).toBe(
            InExVat.Excluding,
        );
    });

    it('respects an explicit inExVat override', () => {
        const input = manualMutationInputSchema.parse({
            ...baseInput,
            inExVat: InExVat.Excluding,
        });
        expect(buildManualMutationPayload(input).inExVat).toBe(
            InExVat.Excluding,
        );
    });

    it('maps ledger/rowLedger onto the top-level and row ledgerId', () => {
        const input = manualMutationInputSchema.parse(baseInput);
        const payload = buildManualMutationPayload(input);
        expect(payload.ledgerId).toBe(1300);
        expect(payload.rows[0]?.ledgerId).toBe(4200);
    });

    it('falls back to the mutation description for the row when rowDescription is omitted', () => {
        const input = manualMutationInputSchema.parse({
            ...baseInput,
            description: 'Baseus PicoGo powerbank',
        });
        const payload = buildManualMutationPayload(input);
        expect(payload.rows[0]?.description).toBe('Baseus PicoGo powerbank');
    });

    it('prefers an explicit rowDescription over the mutation description', () => {
        const input = manualMutationInputSchema.parse({
            ...baseInput,
            description: 'Amazon order',
            rowDescription: 'Baseus PicoGo powerbank',
        });
        const payload = buildManualMutationPayload(input);
        expect(payload.description).toBe('Amazon order');
        expect(payload.rows[0]?.description).toBe('Baseus PicoGo powerbank');
    });

    it('puts the full amount and VAT code on the single row', () => {
        const input = manualMutationInputSchema.parse(baseInput);
        const payload = buildManualMutationPayload(input);
        expect(payload.rows[0]?.amount).toBe(53.99);
        expect(payload.rows[0]?.vatCode).toBe(VatCode.HoogInk21);
        expect(payload.type).toBe(MutationType.GeneralJournal);
    });
});
