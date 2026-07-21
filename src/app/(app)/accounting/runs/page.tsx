import { type Metadata } from 'next';

import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { RunsBrowser } from '../_components/RunsBrowser';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Runs · Accounting Importer',
};

export default function RunsPage() {
    void api.accounting.credentials.list.prefetch();

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-accounting__runs',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Run history
                    </h1>
                </header>
                <RunsBrowser />
            </main>
        </HydrateClient>
    );
}
