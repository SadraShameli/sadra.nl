import type { Booking } from '~/lib/accounting/core/types';
import type {
    CreateInvoiceRequest,
    CreatePaymentRequest,
} from '~/lib/accounting/providers/moneybird/schemas';

import { ManualPaymentAction } from '~/lib/accounting/providers/moneybird/schemas';

export function invoicePayload(
    booking: Booking,
    contactId: null | string,
): CreateInvoiceRequest {
    return {
        contactId: contactId ?? undefined,
        date: booking.date,
        detailsAttributes: [
            {
                description: bookingDescription(booking),
                ledgerAccountId: booking.counterpartLedger.id,
                price: bookingAmount(booking),
                taxRateId: booking.taxCode,
            },
        ],
        reference: booking.txnId,
    };
}

export function isPurchaseInvoice(booking: Booking): boolean {
    return booking.isRefund === true || booking.direction === 'OUT';
}

export function paymentPayload(booking: Booking): CreatePaymentRequest {
    return {
        ledgerAccountId: booking.bank.id,
        manualPaymentAction: ManualPaymentAction.BalanceSettlement,
        paymentDate: booking.date,
        price: bookingAmount(booking),
    };
}

function bookingAmount(booking: Booking): number {
    return booking.isRefund === true ? -booking.amountEur : booking.amountEur;
}

function bookingDescription(booking: Booking): string {
    const conversion = booking.notes.join(' + ');
    return `${booking.counterpartName} | ${booking.txnId} | ${booking.bank.label} | ${conversion}`.slice(
        0,
        255,
    );
}
