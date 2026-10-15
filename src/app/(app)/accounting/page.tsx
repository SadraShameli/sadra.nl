import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountingDataSkeleton } from '~/app/(app)/accounting/_components/AccountingDataSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireRootUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { AccountingDashboard } from './_components/AccountingDashboard';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Accounting Importer',
};

export default function AccountingPage() {
    return (
        <PageTransition>
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
                <Suspense fallback={<AccountingDataSkeleton />}>
                    <AccountingDashboardContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function AccountingDashboardContent() {
    await requireRootUser();
    await Promise.all([
        api.accounting.credentials.list.prefetch(),
        api.accounting.summary.prefetch(),
    ]);
    return (
        <HydrateClient>
            <AccountingDashboard />
        </HydrateClient>
    );
}
