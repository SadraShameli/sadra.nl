import { AccountingProviderError } from '~/lib/accounting/core/provider-error';

export class MoneybirdApiError extends AccountingProviderError {
    readonly raw: unknown;
    readonly status: number;

    constructor(status: number, body: unknown) {
        super(
            `Moneybird API error (status=${status}): ${extractMessage(body)}`,
        );
        this.name = 'MoneybirdApiError';
        this.status = status;
        this.raw = body;
    }
}

function extractMessage(body: unknown): string {
    if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        if (typeof record.error === 'string') return record.error;
        if (record.errors && typeof record.errors === 'object') {
            const flattened = Object.entries(
                record.errors as Record<string, unknown>,
            )
                .map(([field, messages]) =>
                    Array.isArray(messages)
                        ? `${field}: ${messages.join(', ')}`
                        : `${field}: ${String(messages)}`,
                )
                .join('; ');
            if (flattened) return flattened;
        }
    }
    return stringifyBody(body).slice(0, 200);
}

function stringifyBody(body: unknown): string {
    if (body === null || body === undefined) return '';
    if (typeof body === 'string') return body;
    if (typeof body === 'number' || typeof body === 'boolean') {
        return String(body);
    }
    try {
        return JSON.stringify(body);
    } catch {
        return '[unserialisable error body]';
    }
}
