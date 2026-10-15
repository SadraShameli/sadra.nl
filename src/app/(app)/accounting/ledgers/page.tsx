import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountingDataSkeleton } from '~/app/(app)/accounting/_components/AccountingDataSkeleton';
import { LedgersBrowser } from '~/app/(app)/accounting/_components/LedgersBrowser';
import { PageTransition } from '~/components/PageTransition';
import { requireRootUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Ledgers · Accounting Importer',
};

export default function LedgersPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-accounting__ledgers',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        Ledgers
                    </h1>
                </header>
                <Suspense fallback={<AccountingDataSkeleton />}>
                    <LedgersContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LedgersContent() {
    await requireRootUser();
    await api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <LedgersBrowser />
        </HydrateClient>
    );
}
