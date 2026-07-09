import 'server-only';

export interface ApiClientOptions {
    timeoutMs?: number;
    userAgent?: string;
}

export interface ApiRequestOptions {
    json?: unknown;
    params?: Record<string, string | undefined>;
    requiresAuth?: boolean;
}

export abstract class AccountingApiClientBase {
    protected abstract readonly baseUrl: string;
    protected readonly timeoutMs: number;
    protected readonly userAgent: string;

    protected constructor(options: ApiClientOptions = {}) {
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.userAgent = options.userAgent ?? 'sadranl-accounting-importer/0.1';
    }

    async request(
        method: string,
        path: string,
        { json, params, requiresAuth = true }: ApiRequestOptions = {},
    ): Promise<unknown> {
        const normalisedPath = path.startsWith('/') ? path : `/${path}`;
        const url = new URL(this.baseUrl + normalisedPath);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) url.searchParams.set(key, value);
            }
        }
        const headers: Record<string, string> = {
            'User-Agent': this.userAgent,
        };
        if (json !== undefined) headers['Content-Type'] = 'application/json';
        if (requiresAuth) Object.assign(headers, await this.authHeader());

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(new Error('Request timed out')),
            this.timeoutMs,
        );
        try {
            const response = await fetch(url, {
                body: json === undefined ? undefined : JSON.stringify(json),
                headers,
                method,
                signal: controller.signal,
            });
            let body: unknown = null;
            const text = await response.text();
            if (text) {
                try {
                    body = JSON.parse(text);
                } catch {
                    body = text;
                }
            }
            if (response.status >= 400) this.raiseError(response.status, body);
            return body;
        } finally {
            clearTimeout(timeout);
        }
    }

    protected abstract authHeader():
        Promise<Record<string, string>> | Record<string, string>;

    protected abstract raiseError(status: number, body: unknown): never;
}
