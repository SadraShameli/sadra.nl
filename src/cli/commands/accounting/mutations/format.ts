import type { CreateMutationRequestPayload } from '~/lib/accounting/providers/eboekhouden/schemas';
import type { MutationResponse } from '~/lib/accounting/providers/eboekhouden/schemas';

import {
    MUTATION_TYPE_LABEL,
    type MutationType,
} from '~/lib/accounting/providers/eboekhouden/enums';

export function formatMutationDetail(mutation: MutationResponse): string[] {
    const lines = [
        `id: ${mutation.id}`,
        `date: ${mutation.date}`,
        `type: ${typeLabel(mutation.type)}`,
        `ledger: ${mutation.ledgerId}`,
        `description: ${mutation.description ?? ''}`,
    ];
    if (mutation.paymentReference) {
        lines.push(`paymentReference: ${mutation.paymentReference}`);
    }
    lines.push('rows:');
    for (const row of mutation.rows) {
        lines.push(
            `  amount=${formatEur(row.amount)}  ledger=${row.ledgerId ?? '-'}  vat=${row.vatCode ?? '-'}  ${row.description ?? ''}`.trimEnd(),
        );
    }
    return lines;
}

export function formatMutationPayload(
    payload: CreateMutationRequestPayload,
): string[] {
    const lines = [
        `type: ${typeLabel(payload.type)}`,
        `date: ${payload.date}`,
        `ledger: ${payload.ledgerId}`,
        `inExVat: ${payload.inExVat ?? '-'}`,
        `description: ${payload.description ?? ''}`,
    ];
    if (payload.invoiceNumber) {
        lines.push(`invoiceNumber: ${payload.invoiceNumber}`);
    }
    if (payload.relationId) {
        lines.push(`relationId: ${payload.relationId}`);
    }
    lines.push('rows:');
    for (const row of payload.rows) {
        lines.push(
            `  amount=${formatEur(row.amount)}  ledger=${row.ledgerId ?? '-'}  vat=${row.vatCode}  ${row.description ?? ''}`.trimEnd(),
        );
    }
    return lines;
}

export function formatMutationSummary(mutation: MutationResponse): string {
    const total = mutation.rows.reduce((sum, row) => sum + row.amount, 0);
    return [
        `[${mutation.id}] ${mutation.date}`,
        typeLabel(mutation.type),
        `ledger=${mutation.ledgerId}`,
        formatEur(total),
        mutation.description ?? '',
    ]
        .join('  ')
        .trimEnd();
}

function formatEur(amount: number): string {
    return `€${amount.toFixed(2)}`;
}

function typeLabel(type: string): string {
    return Object.hasOwn(MUTATION_TYPE_LABEL, type)
        ? MUTATION_TYPE_LABEL[type as MutationType]
        : type;
}
