import { type Metadata } from 'next';

import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

import { AccountingDashboard } from './_components/AccountingDashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Accounting Importer',
};

export default async function AccountingPage() {
    await Promise.all([
        api.accounting.credentials.list.prefetch(),
        api.accounting.summary.prefetch(),
    ]);

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-accounting__dashboard',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Accounting Importer
                    </h1>
                </header>

                <AccountingDashboard />
            </main>
        </HydrateClient>
    );
}
