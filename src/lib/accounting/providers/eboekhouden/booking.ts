import type { Booking } from '~/lib/accounting/core/types';
import type { CreateMutationRequestPayload } from '~/lib/accounting/providers/eboekhouden/schemas';

import {
    InExVat,
    MutationType,
    parseVatCode,
    requiresExcludingVat,
} from '~/lib/accounting/providers/eboekhouden/enums';

export function bookingToMutationPayload(
    booking: Booking,
): CreateMutationRequestPayload {
    const vatCode = parseVatCode(booking.taxCode);
    const inExVat = requiresExcludingVat(vatCode)
        ? InExVat.Excluding
        : InExVat.Including;
    const isRefund = booking.isRefund === true;
    const type =
        isRefund || booking.direction === 'OUT'
            ? MutationType.MoneySent
            : MutationType.MoneyReceived;
    const amount = isRefund ? -booking.amountEur : booking.amountEur;
    const conversion = booking.notes.join(' + ');
    return {
        checkPaymentReference: true,
        date: booking.date,
        description:
            `${booking.counterpartName} | ${booking.txnId} | ${booking.bank.label} | ${conversion}`.slice(
                0,
                255,
            ),
        inExVat,
        ledgerId: Number(booking.bank.id),
        paymentReference: booking.txnId.slice(0, 50),
        rows: [
            {
                amount,
                description:
                    `${booking.counterpartName} | ${booking.txnId} | ${booking.bank.label} | ${conversion}`.slice(
                        0,
                        255,
                    ),
                ledgerId: Number(booking.counterpartLedger.id),
                vatCode,
            },
        ],
        type,
    };
}
