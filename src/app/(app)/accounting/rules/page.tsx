import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountingDataSkeleton } from '~/app/(app)/accounting/_components/AccountingDataSkeleton';
import { RulesManager } from '~/app/(app)/accounting/_components/RulesManager';
import { PageTransition } from '~/components/PageTransition';
import { requireRootUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Booking rules · Accounting Importer',
};

export default function RulesPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-accounting__rules',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        Booking rules
                    </h1>
                </header>
                <Suspense fallback={<AccountingDataSkeleton />}>
                    <RulesContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function RulesContent() {
    await requireRootUser();
    await api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <RulesManager />
        </HydrateClient>
    );
}
