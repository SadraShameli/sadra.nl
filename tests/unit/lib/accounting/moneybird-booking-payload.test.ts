import { describe, expect, it } from 'vitest';

import type { Booking } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { LedgerId } from '~/lib/accounting/core/ids';
import {
    invoicePayload,
    isPurchaseInvoice,
    paymentPayload,
} from '~/lib/accounting/providers/moneybird/booking';
import { ManualPaymentAction } from '~/lib/accounting/providers/moneybird/schemas';

const baseBooking: Booking = {
    amountEur: 120.5,
    bank: { id: LedgerId('bank-1'), label: 'Wise EUR' },
    counterpartLedger: { id: LedgerId('ledger-99'), label: 'Software' },
    counterpartName: 'Anthropic Ireland',
    date: isoDateSchema.parse('2026-02-01'),
    direction: 'OUT',
    notes: ['EUR+fee0.50'],
    sourceCurrency: currencyCodeSchema.parse('EUR'),
    taxCode: 'tax-rate-1',
    txnId: 'TX-1234567890',
};

describe('isPurchaseInvoice', () => {
    it('is true for OUT bookings', () => {
        expect(isPurchaseInvoice(baseBooking)).toBe(true);
    });

    it('is false for IN bookings', () => {
        expect(isPurchaseInvoice({ ...baseBooking, direction: 'IN' })).toBe(
            false,
        );
    });

    it('is true for a refund regardless of direction', () => {
        expect(
            isPurchaseInvoice({
                ...baseBooking,
                direction: 'IN',
                isRefund: true,
            }),
        ).toBe(true);
    });
});

describe('invoicePayload', () => {
    it('books the counterpart ledger and tax rate on the single detail line', () => {
        const payload = invoicePayload(baseBooking, 'contact-1');
        expect(payload.detailsAttributes).toHaveLength(1);
        expect(payload.detailsAttributes[0]).toMatchObject({
            ledgerAccountId: LedgerId('ledger-99'),
            price: 120.5,
            taxRateId: 'tax-rate-1',
        });
    });

    it('uses the txnId as the reference for idempotent lookups', () => {
        expect(invoicePayload(baseBooking, 'contact-1').reference).toBe(
            'TX-1234567890',
        );
    });

    it('omits contactId when no contact was resolved', () => {
        expect(invoicePayload(baseBooking, null).contactId).toBeUndefined();
    });

    it('negates the amount for a refund', () => {
        const payload = invoicePayload(
            { ...baseBooking, isRefund: true },
            'contact-1',
        );
        expect(payload.detailsAttributes[0]?.price).toBe(-120.5);
    });

    it('description includes counterpart, txnId, bank label, and notes', () => {
        const payload = invoicePayload(baseBooking, 'contact-1');
        expect(payload.detailsAttributes[0]?.description).toBe(
            'Anthropic Ireland | TX-1234567890 | Wise EUR | EUR+fee0.50',
        );
    });
});

describe('paymentPayload', () => {
    it('settles against the bank ledger, not the counterpart ledger', () => {
        const payload = paymentPayload(baseBooking);
        expect(payload.ledgerAccountId).toBe(LedgerId('bank-1'));
    });

    it('always uses balance_settlement', () => {
        expect(paymentPayload(baseBooking).manualPaymentAction).toBe(
            ManualPaymentAction.BalanceSettlement,
        );
    });

    it('matches the invoice amount sign for a refund', () => {
        const payload = paymentPayload({ ...baseBooking, isRefund: true });
        expect(payload.price).toBe(-120.5);
    });
});
