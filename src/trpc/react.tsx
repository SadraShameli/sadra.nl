'use client';

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchStreamLink, loggerLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
import { useState } from 'react';
import SuperJSON from 'superjson';

import type { AppRouter } from '~/server/api/root';

import { apiRoutes } from '~/lib/site/routes';
import { getPublicSiteOrigin } from '~/lib/site/url';

import { createQueryClient } from './query-client';

let clientQueryClientSingleton: QueryClient | undefined;
const getQueryClient = () => {
    if (typeof window === 'undefined') {
        return createQueryClient();
    }
    return (clientQueryClientSingleton ??= createQueryClient());
};

export const api = createTRPCReact<AppRouter>();
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export function TRPCReactProvider(properties: { children: React.ReactNode }) {
    const queryClient = getQueryClient();

    const [trpcClient] = useState(() =>
        api.createClient({
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
            <api.Provider client={trpcClient} queryClient={queryClient}>
                {properties.children}
            </api.Provider>
        </QueryClientProvider>
    );
}

function getBaseUrl() {
    if (typeof window !== 'undefined') return window.location.origin;
    return getPublicSiteOrigin();
}
