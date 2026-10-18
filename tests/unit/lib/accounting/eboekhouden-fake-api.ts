import { vi } from 'vitest';
import { z } from 'zod';

const DEFAULT_LIMIT = 100;
const DATE_PARAMETER = /^date(?:\[(?<operator>[a-z_]+)\])?$/;

enum FakeDateOperator {
    Equal = 'eq',
    GreaterThan = 'gt',
    GreaterThanOrEqual = 'gte',
    LessThan = 'lt',
    LessThanOrEqual = 'lte',
    Range = 'range',
}

export interface FakeMutation {
    readonly date: string;
    readonly id: number;
}

export class FakeEBoekhoudenApi {
    static serve(mutations: readonly FakeMutation[]): FakeEBoekhoudenApi {
        const api = new FakeEBoekhoudenApi(mutations);
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
            Promise.resolve(api.respond(input, init)),
        );
        return api;
    }

    readonly mutationRequests: URL[] = [];

    constructor(private readonly mutations: readonly FakeMutation[]) {}

    private page(url: URL): { count: number; items: object[] } {
        const matching = this.mutations.filter((mutation) =>
            isWithinDateFilter(mutation.date, url.searchParams),
        );
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
        const items = matching
            .slice(offset, offset + limit)
            .map((mutation) => ({
                date: mutation.date,
                id: mutation.id,
                ledgerId: 1,
                rows: [],
                type: 'Payment',
            }));
        return { count: items.length, items };
    }

    respond(input: Request | string | URL, init?: RequestInit): Response {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith('/session')) {
            return init?.method === 'DELETE'
                ? new Response(null, { status: 204 })
                : Response.json({ expiresIn: 3600, token: 'session-token' });
        }
        if (url.pathname.endsWith('/mutation')) {
            this.mutationRequests.push(url);
            return Response.json(this.page(url));
        }
        throw new Error(`Unexpected request to ${url.pathname}`);
    }
}

function isWithinDateFilter(
    date: string,
    parameters: URLSearchParams,
): boolean {
    const filters = [...parameters]
        .filter(([key]) => key.startsWith('date'))
        .map(([key, value]) => ({
            operator: z
                .enum(FakeDateOperator)
                .parse(
                    DATE_PARAMETER.exec(key)?.groups?.operator ??
                        FakeDateOperator.Equal,
                ),
            value,
        }));
    if (filters.length > 1) {
        throw new Error('e-Boekhouden applies only one filter per parameter');
    }
    const filter = filters[0];
    if (filter === undefined) return true;
    switch (filter.operator) {
        case FakeDateOperator.Equal: {
            return date === filter.value;
        }
        case FakeDateOperator.GreaterThan: {
            return date > filter.value;
        }
        case FakeDateOperator.GreaterThanOrEqual: {
            return date >= filter.value;
        }
        case FakeDateOperator.LessThan: {
            return date < filter.value;
        }
        case FakeDateOperator.LessThanOrEqual: {
            return date <= filter.value;
        }
        case FakeDateOperator.Range: {
            const [from = '', to = ''] = filter.value.split(',', 2);
            return date >= from && date <= to;
        }
    }
}
