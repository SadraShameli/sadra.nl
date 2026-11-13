import 'server-only';
import {
    dehydrate,
    HydrationBoundary,
    type QueryExecuteOptions,
    type QueryKey,
} from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { cache, type ReactNode } from 'react';

import { appRouter, createCaller } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

import { createQueryClient } from './query-client';

const createContext = async () => {
    await connection();
    const heads = new Headers(await headers());
    heads.set('x-trpc-source', 'rsc');

    return createTRPCContext({
        headers: heads,
    });
};

const getQueryClient = cache(createQueryClient);

export const caller = createCaller(createContext);

export const trpc = createTRPCOptionsProxy({
    ctx: createContext,
    queryClient: getQueryClient,
    router: appRouter,
});

export function HydrateClient(properties: { children: ReactNode }) {
    return (
        <HydrationBoundary state={dehydrate(getQueryClient())}>
            {properties.children}
        </HydrationBoundary>
    );
}

export async function prefetch<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey extends QueryKey,
>(
    options: QueryExecuteOptions<
        TQueryFnData,
        TError,
        TData,
        TQueryData,
        TQueryKey
    >,
): Promise<void> {
    await Promise.allSettled([getQueryClient().query(options)]);
}
