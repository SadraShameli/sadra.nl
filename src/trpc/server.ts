import 'server-only';
import { createHydrationHelpers } from '@trpc/react-query/rsc';
import { headers } from 'next/headers';

import { type AppRouter, createCaller } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

import { createQueryClient } from './query-client';

const createContext = async () => {
    const heads = new Headers(await headers());
    heads.set('x-trpc-source', 'rsc');

    return createTRPCContext({
        headers: heads,
    });
};

const getQueryClient = () => createQueryClient();
const caller = createCaller(createContext);

export const { HydrateClient, trpc: api } = createHydrationHelpers<AppRouter>(
    caller,
    getQueryClient,
);
