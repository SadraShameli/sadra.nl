import { type Metadata } from 'next';

import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

import { LedgersBrowser } from '../_components/LedgersBrowser';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Ledgers · Accounting Importer',
};

export default function LedgersPage() {
    void api.accountingImporter.credentials.list.prefetch();

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-accounting-importer__ledgers',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Ledgers
                    </h1>
                </header>
                <LedgersBrowser />
            </main>
        </HydrateClient>
    );
}
