import { type Metadata } from 'next';

import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { RulesManager } from '../_components/RulesManager';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Booking rules · Accounting Importer',
};

export default function RulesPage() {
    void api.accounting.credentials.list.prefetch();

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-accounting__rules',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Booking rules
                    </h1>
                </header>
                <RulesManager />
            </main>
        </HydrateClient>
    );
}
