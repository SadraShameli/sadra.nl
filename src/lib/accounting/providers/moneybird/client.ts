import 'server-only';
import { z } from 'zod';

import { AccountingApiClientBase } from '~/lib/accounting/core/api-client';
import { MoneybirdApiError } from '~/lib/accounting/providers/moneybird/errors';
import {
    administrationSchema,
    type MoneybirdAdministration,
} from '~/lib/accounting/providers/moneybird/schemas';

const BASE_URL = 'https://moneybird.com/api/v2';

export interface MoneybirdClientOptions {
    timeoutMs?: number;
}

export class MoneybirdClient extends AccountingApiClientBase {
    protected readonly baseUrl: string;

    protected readonly token: string;

    constructor(
        token: string,
        administrationId: string,
        options: MoneybirdClientOptions = {},
    ) {
        super(options);
        if (administrationId.trim().length === 0) {
            throw new Error('MoneybirdClient requires an administrationId');
        }
        this.token = token;
        this.baseUrl = `${BASE_URL}/${administrationId}`;
    }

    protected authHeader(): Record<string, string> {
        return { Authorization: `Bearer ${this.token}` };
    }

    protected raiseError(status: number, body: unknown): never {
        throw new MoneybirdApiError(status, body);
    }
}

export async function listMoneybirdAdministrations(
    token: string,
): Promise<MoneybirdAdministration[]> {
    const response = await fetch(`${BASE_URL}/administrations.json`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (response.status >= 400) {
        throw new MoneybirdApiError(response.status, body);
    }
    return z.array(administrationSchema).parse(body);
}
