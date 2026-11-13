'use client';

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createTRPCClient,
    httpBatchStreamLink,
    loggerLink,
} from '@trpc/client';
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import SuperJSON from 'superjson';

import type { AppRouter } from '~/server/api/root';

import { apiRoutes } from '~/lib/site/routes';
import { getPublicSiteOrigin } from '~/lib/site/url';

import { createQueryClient } from './query-client';

const clientQueryClientSingleton: { current: QueryClient | undefined } = {
    current: undefined,
};
const getQueryClient = () => {
    return typeof window === 'undefined'
        ? createQueryClient()
        : (clientQueryClientSingleton.current ??= createQueryClient());
};

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export function TRPCReactProvider(properties: { children: React.ReactNode }) {
    const queryClient = getQueryClient();

    const [trpcClient] = useState(() =>
        createTRPCClient<AppRouter>({
            links: [
                loggerLink({
                    enabled: (op) =>
                        process.env.NODE_ENV === 'development' ||
                        (op.direction === 'down' && op.result instanceof Error),
                }),
                httpBatchStreamLink({
                    headers: () => {
                        const headers = new Headers();
                        headers.set('x-trpc-source', 'nextjs-react');
                        return headers;
                    },
                    transformer: SuperJSON,
                    url: getBaseUrl() + apiRoutes.trpc,
                }),
            ],
        }),
    );

    return (
        <QueryClientProvider client={queryClient}>
            <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
                {properties.children}
            </TRPCProvider>
        </QueryClientProvider>
    );
}

function getBaseUrl() {
    return typeof window === 'undefined'
        ? getPublicSiteOrigin()
        : window.location.origin;
}
