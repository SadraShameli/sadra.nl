import { type Metadata } from 'next';

import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

import { MutationsBrowser } from '../_components/MutationsBrowser';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Mutations · Accounting Importer',
};

export default function MutationsPage() {
    void api.accounting.credentials.list.prefetch();

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-accounting__mutations',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Recent mutations
                    </h1>
                </header>
                <MutationsBrowser />
            </main>
        </HydrateClient>
    );
}
