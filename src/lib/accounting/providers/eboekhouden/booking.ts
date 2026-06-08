import type { Booking } from '~/lib/accounting/core/types';

import type { CreateMutationRequestPayload } from './schemas';

import { IN_EX_VAT, MUTATION_TYPES, requiresExcludingVat } from './enums';
export function bookingToMutationPayload(
    booking: Booking,
): CreateMutationRequestPayload {
    const inExVat = requiresExcludingVat(booking.vatCode)
        ? IN_EX_VAT.EXCLUDING
        : IN_EX_VAT.INCLUDING;
    const isRefund = booking.isRefund === true;
    const type =
        isRefund || booking.direction === 'OUT'
            ? MUTATION_TYPES.MONEY_SENT
            : MUTATION_TYPES.MONEY_RECEIVED;
    const amount = isRefund ? -booking.amountEur : booking.amountEur;
    return {
        checkPaymentReference: true,
        date: booking.date,
        description: booking.counterpartName.slice(0, 50),
        inExVat,
        ledgerId: booking.bank.id,
        paymentReference: booking.txnId.slice(0, 50),
        rows: [
            {
                amount,
                description:
                    `${booking.counterpartName} ${booking.txnId}`.slice(0, 50),
                ledgerId: booking.counterpartLedger.id,
                vatCode: booking.vatCode,
            },
        ],
        type,
    };
}
