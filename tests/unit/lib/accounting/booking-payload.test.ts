import { describe, expect, it } from 'vitest';

import type { Booking } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { bookingToMutationPayload } from '~/lib/accounting/providers/eboekhouden/booking';
import { MUTATION_TYPES } from '~/lib/accounting/providers/eboekhouden/enums';

const baseBooking: Booking = {
    amountEur: 120.5,
    bank: { id: 1, label: 'Wise EUR' },
    counterpartLedger: { id: 99, label: 'Software' },
    counterpartName: 'Anthropic Ireland',
    date: isoDateSchema.parse('2026-02-01'),
    direction: 'OUT',
    notes: ['EUR+fee0.50'],
    sourceCurrency: currencyCodeSchema.parse('EUR'),
    taxCode: 'BI_EU_INK',
    txnId: 'TX-1234567890',
};

describe('bookingToMutationPayload', () => {
    it('emits MONEY_SENT for OUT and MONEY_RECEIVED for IN', () => {
        expect(bookingToMutationPayload(baseBooking).type).toBe(
            MUTATION_TYPES.MONEY_SENT,
        );
        expect(
            bookingToMutationPayload({
                ...baseBooking,
                direction: 'IN',
            }).type,
        ).toBe(MUTATION_TYPES.MONEY_RECEIVED);
    });

    it('marks reverse-charge bookings as inExVat=EX', () => {
        const payload = bookingToMutationPayload(baseBooking);
        expect(payload.inExVat).toBe('EX');
    });

    it('description matches row description: counterpart, txnId, source bank, conversion note', () => {
        const payload = bookingToMutationPayload(baseBooking);
        expect(payload.description).toBe(
            'Anthropic Ireland | TX-1234567890 | Wise EUR | EUR+fee0.50',
        );
        expect(payload.description).toBe(payload.rows[0]?.description);
    });

    it('row description includes counterpart, txnId, source bank, and conversion note', () => {
        const payload = bookingToMutationPayload(baseBooking);
        expect(payload.rows[0]?.description).toBe(
            'Anthropic Ireland | TX-1234567890 | Wise EUR | EUR+fee0.50',
        );
    });

    it('description includes all notes when multiple conversions are joined', () => {
        const payload = bookingToMutationPayload({
            ...baseBooking,
            notes: ['USD@ECB1.1595', 'EUR+fee0.00'],
        });
        expect(payload.description).toBe(
            'Anthropic Ireland | TX-1234567890 | Wise EUR | USD@ECB1.1595 + EUR+fee0.00',
        );
    });

    it('truncates description to 255 chars and paymentReference to 50 chars', () => {
        const long = bookingToMutationPayload({
            ...baseBooking,
            counterpartName: 'X'.repeat(250),
            txnId: 'Y'.repeat(100),
        });
        expect(long.description?.length).toBeLessThanOrEqual(255);
        expect(long.paymentReference?.length).toBe(50);
    });

    it('always sets checkPaymentReference', () => {
        expect(
            bookingToMutationPayload(baseBooking).checkPaymentReference,
        ).toBe(true);
    });

    it('posts a refund as a negative MONEY_SENT keeping the purchase VAT code', () => {
        const payload = bookingToMutationPayload({
            ...baseBooking,
            amountEur: 29.9,
            counterpartName: 'Apex Trader Funding',
            direction: 'IN',
            isRefund: true,
            taxCode: 'BU_EU_INK',
        });
        expect(payload.type).toBe(MUTATION_TYPES.MONEY_SENT);
        expect(payload.rows[0]?.amount).toBe(-29.9);
        expect(payload.rows[0]?.vatCode).toBe('BU_EU_INK');
    });
});
