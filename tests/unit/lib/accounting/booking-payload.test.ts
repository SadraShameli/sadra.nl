import { describe, expect, it } from 'vitest';

import type { Booking } from '~/lib/accounting/core/types';

import { bookingToMutationPayload } from '~/lib/accounting/providers/eboekhouden/booking';
import { MUTATION_TYPES } from '~/lib/accounting/providers/eboekhouden/enums';

const baseBooking: Booking = {
    amountEur: 120.5,
    bank: { id: 1, label: 'Wise EUR' },
    counterpartLedger: { id: 99, label: 'Software' },
    counterpartName: 'Anthropic Ireland',
    date: '2026-02-01',
    direction: 'OUT',
    notes: ['EUR+fee0.50'],
    txnId: 'TX-1234567890',
    vatCode: 'BI_EU_INK',
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

    it('truncates description / payment reference to 50 chars', () => {
        const long = bookingToMutationPayload({
            ...baseBooking,
            counterpartName: 'X'.repeat(100),
            txnId: 'Y'.repeat(100),
        });
        expect(long.description?.length).toBe(50);
        expect(long.paymentReference?.length).toBe(50);
    });

    it('always sets checkPaymentReference', () => {
        expect(
            bookingToMutationPayload(baseBooking).checkPaymentReference,
        ).toBe(true);
    });
});
