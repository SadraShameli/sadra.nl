import 'server-only';

import { AccountingApiClientBase } from '~/lib/accounting/core/api-client';
import {
    payloadFromResponse,
    raiseForPayload,
} from '~/lib/accounting/providers/eboekhouden/errors';
import {
    type SessionResponse,
    sessionSchema,
} from '~/lib/accounting/providers/eboekhouden/schemas';

export interface EBoekhoudenClientOptions {
    source?: string;
    timeoutMs?: number;
}

export class EBoekhoudenClient extends AccountingApiClientBase {
    protected readonly accessToken: string;

    protected readonly baseUrl = 'https://api.e-boekhouden.nl/v1';

    protected session: null | SessionResponse = null;

    protected readonly source: string;

    constructor(accessToken: string, options: EBoekhoudenClientOptions = {}) {
        super(options);
        this.accessToken = accessToken;
        this.source = options.source ?? 'sadranl';
    }

    async closeSession(): Promise<void> {
        if (!this.session) return;
        await this.request('DELETE', '/session');
        this.session = null;
    }

    async openSession(): Promise<SessionResponse> {
        const body = await this.request('POST', '/session', {
            json: { accessToken: this.accessToken, source: this.source },
            requiresAuth: false,
        });
        this.session = sessionSchema.parse(body);
        return this.session;
    }

    protected authHeader(): Record<string, string> {
        if (!this.session) throw new Error('Call openSession() first');
        return { Authorization: this.session.token };
    }

    protected raiseError(status: number, body: unknown): never {
        raiseForPayload(payloadFromResponse(status, body));
    }
}
