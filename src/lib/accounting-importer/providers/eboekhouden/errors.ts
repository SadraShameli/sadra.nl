import { z } from 'zod';

import type { SecurityErrorType } from './enums';

import { SECURITY_ERROR_TYPES } from './enums';

export const apiErrorPayloadSchema = z.object({
    code: z.string().nullish(),
    errors: z.array(z.string()).nullish(),
    propertyName: z.string().nullish(),
    raw: z.unknown().optional(),
    securityType: z.enum(SECURITY_ERROR_TYPES).nullish(),
    status: z.coerce.number(),
    title: z.string().default(''),
    type: z.string().default('http'),
});

export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;

export class EBoekhoudenError extends Error {
    readonly payload: ApiErrorPayload;
    constructor(payload: ApiErrorPayload) {
        super(
            `[${payload.code ?? payload.type}] ${payload.title} (status=${payload.status})`,
        );
        this.name = 'EBoekhoudenError';
        this.payload = payload;
    }
}

export class ApiError extends EBoekhoudenError {
    constructor(payload: ApiErrorPayload) {
        super(payload);
        this.name = 'ApiError';
    }
}

export class SecurityApiError extends EBoekhoudenError {
    readonly securityType: null | SecurityErrorType;
    constructor(payload: ApiErrorPayload) {
        super(payload);
        this.name = 'SecurityApiError';
        this.securityType = payload.securityType ?? null;
    }
}

export class ValidationApiError extends EBoekhoudenError {
    constructor(payload: ApiErrorPayload) {
        super(payload);
        this.name = 'ValidationApiError';
    }
}

export function payloadFromResponse(
    status: number,
    body: unknown,
): ApiErrorPayload {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        const parsed = apiErrorPayloadSchema.safeParse({
            ...body,
            raw: body,
            status: (body as Record<string, unknown>).status ?? status,
        });
        if (parsed.success) return parsed.data;
    }
    return {
        raw: { body },
        status,
        title: stringifyBody(body).slice(0, 200),
        type: 'http',
    };
}

export function raiseForPayload(payload: ApiErrorPayload): never {
    switch (payload.type) {
        case 'security': {
            throw new SecurityApiError(payload);
        }
        case 'validation': {
            throw new ValidationApiError(payload);
        }
        default: {
            throw new ApiError(payload);
        }
    }
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
