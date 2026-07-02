import 'server-only';
import { z } from 'zod';

const PAGE_SIZE = 100;
const TAG_RE = /<[^>]+>/g;

export interface WiseCardTransaction {
    created: string;
    id: string;
    isRefund: boolean;
    merchant: string;
    primaryAmount: number;
    primaryCurrency: string;
    secondaryAmount: number;
    secondaryCurrency: string;
}

export interface WiseProfile {
    id: number;
    type: string;
}

export interface WiseRecipient {
    accountHolderName: string;
    id: number;
}

export interface WiseTransfer {
    created: string;
    id: number;
    reference: string;
    sourceCurrency: string;
    sourceValue: number;
    status: string;
    targetAccountId: number;
    targetCurrency: string;
    targetValue: number;
}

const profileSchema = z.object({ id: z.number(), type: z.string() });
const transferSchema = z.object({
    created: z.string(),
    details: z.object({ reference: z.string().nullish() }).nullish(),
    id: z.number(),
    sourceCurrency: z.string(),
    sourceValue: z.number(),
    status: z.string(),
    targetAccount: z.number(),
    targetCurrency: z.string(),
    targetValue: z.number(),
});
const activitiesSchema = z.object({
    activities: z
        .array(
            z.object({
                createdOn: z.string(),
                primaryAmount: z.string().nullish(),
                resource: z.object({ id: z.union([z.string(), z.number()]) }),
                secondaryAmount: z.string().nullish(),
                status: z.string(),
                title: z.string().nullish(),
                type: z.string(),
            }),
        )
        .default([]),
    cursor: z.string().nullish(),
});
const recipientSchema = z.object({
    accountHolderName: z.string().nullish(),
    name: z.object({ fullName: z.string().nullish() }).nullish(),
});

export interface WiseClientOptions {
    fetch?: typeof fetch;
    sandbox?: boolean;
    timeoutMs?: number;
}

export class WiseClient {
    static readonly PRODUCTION_URL = 'https://api.wise.com';
    static readonly SANDBOX_URL = 'https://api.wise-sandbox.com';
    static readonly USER_AGENT = 'sadranl-accounting-importer/0.1';

    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;
    private readonly token: string;

    constructor(token: string, options: WiseClientOptions = {}) {
        this.token = token;
        this.baseUrl = options.sandbox
            ? WiseClient.SANDBOX_URL
            : WiseClient.PRODUCTION_URL;
        this.fetchImpl = options.fetch ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 30_000;
    }

    async getRecipient(accountId: number): Promise<null | WiseRecipient> {
        try {
            const body = await this.get<unknown>(`/v2/accounts/${accountId}`);
            const parsed = recipientSchema.safeParse(body);
            if (!parsed.success) return null;
            const name =
                parsed.data.name?.fullName ??
                parsed.data.accountHolderName ??
                '';
            return { accountHolderName: name, id: accountId };
        } catch {
            return null;
        }
    }

    async listCardTransactions(arguments_: {
        from: string;
        profileId: number;
        to: string;
    }): Promise<WiseCardTransaction[]> {
        const out: WiseCardTransaction[] = [];
        let nextCursor: null | string = null;
        for (;;) {
            const parameters: Record<string, string> = {
                size: String(PAGE_SIZE),
            };
            if (nextCursor) parameters.nextCursor = nextCursor;
            const body = await this.get<unknown>(
                `/v1/profiles/${arguments_.profileId}/activities`,
                parameters,
            );
            const parsed = activitiesSchema.parse(body);
            let isStop = false;
            for (const a of parsed.activities) {
                if (
                    !(
                        a.type === 'CARD_PAYMENT' ||
                        a.type.startsWith('DIRECT_DEBIT')
                    ) ||
                    a.status !== 'COMPLETED'
                )
                    continue;
                const created = parseDatetimeIso(a.createdOn);
                const createdDate = created.slice(0, 10);
                if (createdDate < arguments_.from) {
                    isStop = true;
                    continue;
                }
                if (createdDate > arguments_.to) continue;
                const primary = parseAmount(a.primaryAmount);
                if (!primary) continue;
                const secondary = parseAmount(a.secondaryAmount);
                const [pAmt, pCcy] = primary;
                const [sAmt, sCcy] = secondary ?? [pAmt, pCcy];
                out.push({
                    created,
                    id: String(a.resource.id),
                    isRefund: isPositiveAmount(a.primaryAmount),
                    merchant: (a.title ?? '').replaceAll(TAG_RE, '').trim(),
                    primaryAmount: pAmt,
                    primaryCurrency: pCcy,
                    secondaryAmount: sAmt,
                    secondaryCurrency: sCcy,
                });
            }
            if (isStop || !parsed.cursor || parsed.activities.length === 0)
                break;
            nextCursor = parsed.cursor;
        }
        return out;
    }

    async listTransfers(arguments_: {
        from: string;
        profileId: number;
        to: string;
    }): Promise<WiseTransfer[]> {
        const out: WiseTransfer[] = [];
        let offset = 0;
        for (;;) {
            const page = await this.get<unknown>('/v1/transfers', {
                createdDateEnd: arguments_.to,
                createdDateStart: arguments_.from,
                limit: String(PAGE_SIZE),
                offset: String(offset),
                profile: String(arguments_.profileId),
                status: 'outgoing_payment_sent',
            });
            const rows = z.array(transferSchema).parse(page);
            for (const t of rows) {
                out.push({
                    created: parseDatetimeIso(t.created),
                    id: t.id,
                    reference: t.details?.reference ?? '',
                    sourceCurrency: t.sourceCurrency,
                    sourceValue: t.sourceValue,
                    status: t.status,
                    targetAccountId: t.targetAccount,
                    targetCurrency: t.targetCurrency,
                    targetValue: t.targetValue,
                });
            }
            if (rows.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }
        return out;
    }

    async profiles(): Promise<WiseProfile[]> {
        const body = await this.get<unknown>('/v2/profiles');
        return z.array(profileSchema).parse(body);
    }

    private async get<T>(
        path: string,
        parameters?: Record<string, string>,
    ): Promise<T> {
        const url = new URL(path, this.baseUrl);
        if (parameters)
            for (const [k, v] of Object.entries(parameters))
                url.searchParams.set(k, v);

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(new Error('Wise request timed out')),
            this.timeoutMs,
        );
        try {
            const resp = await this.fetchImpl(url, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'User-Agent': WiseClient.USER_AGENT,
                },
                signal: controller.signal,
            });
            if (!resp.ok) {
                throw new Error(
                    `Wise GET ${path} failed: ${resp.status} ${resp.statusText}`,
                );
            }
            return (await resp.json()) as T;
        } finally {
            clearTimeout(timeout);
        }
    }
}

function isPositiveAmount(s: null | string | undefined): boolean {
    if (!s) return false;
    return s.includes('<positive>') || s.trimStart().startsWith('+');
}

function parseAmount(s: null | string | undefined): [number, string] | null {
    if (!s) return null;
    const cleaned = s
        .replaceAll(TAG_RE, '')
        .replaceAll(/[+-]/g, ' ')
        .replaceAll(',', '');
    let value: null | number = null;
    let currency = '';
    for (const token of cleaned.split(/\s+/)) {
        const n = Number.parseFloat(token);
        if (Number.isFinite(n)) value = n;
        else if (token.trim()) currency = token.toUpperCase();
    }
    if (value === null || !currency) return null;
    return [value, currency];
}

function parseDatetimeIso(raw: string): string {
    return raw.replace(' ', 'T').replace('Z', '+00:00');
}
