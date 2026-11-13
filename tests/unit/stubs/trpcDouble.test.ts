import { describe, expect, it, vi } from 'vitest';

import { trpcDoubleQuery, trpcDoubleReact } from '../../stubs/trpcDouble';

const MISSING_PROVIDER =
    'No QueryClient set, use QueryClientProvider to set one';

function invoke(target: unknown, ...args: unknown[]): unknown {
    if (typeof target !== 'function') throw new TypeError('not callable');
    const result: unknown = Reflect.apply(target, undefined, args);
    return result;
}

function isEveryQuery(): boolean {
    return true;
}

function isNoQuery(): boolean {
    return false;
}

function member(value: unknown, key: string): unknown {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
        return undefined;
    }
    const found: unknown = Reflect.get(value, key);
    return found;
}

function memberPath(value: unknown, ...keys: string[]): unknown {
    return keys.reduce((node, key) => member(node, key), value);
}

function setup() {
    const invalidate = vi.fn();
    const invalidateAccount = vi.fn();
    const double = trpcDoubleReact({
        procedures: {
            queryClient: () => ({
                propAccounts: {
                    account: { get: { invalidate: invalidateAccount } },
                    invalidate,
                },
            }),
        },
    });
    const queries = trpcDoubleQuery({
        useQueryClient: () => {
            throw new Error(MISSING_PROVIDER);
        },
    });
    return {
        client: invoke(member(queries, 'useQueryClient')),
        invalidate,
        invalidateAccount,
        trpc: invoke(member(double, 'useTRPC')),
    };
}

describe('the tRPC test double', () => {
    it('forwards the filters of a path filter to the invalidation', () => {
        const { client, invalidate, trpc } = setup();
        const makeFilter = memberPath(trpc, 'propAccounts', 'pathFilter');
        const filter = invoke(makeFilter, { predicate: isEveryQuery });

        invoke(member(client, 'invalidateQueries'), filter);

        expect(invalidate).toHaveBeenCalledExactlyOnceWith(undefined, {
            predicate: isEveryQuery,
        });
    });

    it('forwards the input and the filters of a query filter', () => {
        const { client, invalidateAccount, trpc } = setup();
        const makeFilter = memberPath(
            trpc,
            'propAccounts',
            'account',
            'get',
            'queryFilter',
        );
        const input = { id: 'a1' };
        const filters = { predicate: isNoQuery };
        const filter = invoke(makeFilter, input, filters);

        invoke(member(client, 'invalidateQueries'), filter);

        expect(invalidateAccount).toHaveBeenCalledExactlyOnceWith(
            input,
            filters,
        );
    });

    it('tolerates a component rendered without a query client provider', () => {
        const { client } = setup();

        expect(client).toBeDefined();
    });

    it('rethrows any other error from the real query client hook', () => {
        const queries = trpcDoubleQuery({
            useQueryClient: () => {
                throw new Error('the hook exploded');
            },
        });

        expect(() => invoke(member(queries, 'useQueryClient'))).toThrow(
            'the hook exploded',
        );
    });
});
