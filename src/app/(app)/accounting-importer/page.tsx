import { type Metadata } from 'next';

import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

import { AccountingImporterDashboard } from './_components/AccountingImporterDashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Accounting Importer',
};

export default async function AccountingImporterPage() {
    await Promise.all([
        api.accountingImporter.credentials.list.prefetch(),
        api.accountingImporter.summary.prefetch(),
    ]);

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-accounting-importer__dashboard',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Accounting Importer
                    </h1>
                </header>

                <AccountingImporterDashboard />
            </main>
        </HydrateClient>
    );
}
