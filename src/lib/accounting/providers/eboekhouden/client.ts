import 'server-only';

import {
    payloadFromResponse,
    raiseForPayload,
} from '~/lib/accounting/providers/eboekhouden/errors';
import {
    type SessionResponse,
    sessionSchema,
} from '~/lib/accounting/providers/eboekhouden/schemas';

export interface EBoekhoudenClientOptions {
    fetchImpl?: typeof fetch;
    source?: string;
    timeoutMs?: number;
}

export interface RequestOptions {
    json?: unknown;
    params?: Record<string, string | undefined>;
    withAuth?: boolean;
}

export class EBoekhoudenClient {
    static readonly BASE_URL = 'https://api.e-boekhouden.nl/v1';
    static readonly USER_AGENT = 'sadranl-accounting-importer/0.1';

    readonly source: string;

    get currentSession(): null | SessionResponse {
        return this.session;
    }
    private readonly accessToken: string;
    private readonly fetchImpl: typeof fetch;
    private session: null | SessionResponse = null;

    private readonly timeoutMs: number;

    constructor(accessToken: string, options: EBoekhoudenClientOptions = {}) {
        this.accessToken = accessToken;
        this.source = options.source ?? 'sadranl';
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 30_000;
    }

    async closeSession(): Promise<void> {
        if (!this.session) return;
        await this.request('DELETE', '/session');
        this.session = null;
    }

    async openSession(): Promise<SessionResponse> {
        const body = await this.request('POST', '/session', {
            json: { accessToken: this.accessToken, source: this.source },
            withAuth: false,
        });
        this.session = sessionSchema.parse(body);
        return this.session;
    }

    async request(
        method: string,
        path: string,
        { json, params, withAuth = true }: RequestOptions = {},
    ): Promise<unknown> {
        const normalisedPath = path.startsWith('/') ? path : `/${path}`;
        const url = new URL(EBoekhoudenClient.BASE_URL + normalisedPath);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined) url.searchParams.set(k, v);
            }
        }
        const headers: Record<string, string> = {
            'User-Agent': EBoekhoudenClient.USER_AGENT,
        };
        if (json !== undefined) headers['Content-Type'] = 'application/json';
        if (withAuth) {
            if (!this.session) throw new Error('Call openSession() first');
            headers.Authorization = this.session.token;
        }

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(new Error('eBoekhouden request timed out')),
            this.timeoutMs,
        );

        try {
            const resp = await this.fetchImpl(url, {
                body: json === undefined ? undefined : JSON.stringify(json),
                headers,
                method,
                signal: controller.signal,
            });
            let body: unknown = null;
            const text = await resp.text();
            if (text) {
                try {
                    body = JSON.parse(text);
                } catch {
                    body = text;
                }
            }
            if (resp.status >= 400) {
                raiseForPayload(payloadFromResponse(resp.status, body));
            }
            return body;
        } finally {
            clearTimeout(timeout);
        }
    }
}
