import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountingDataSkeleton } from '~/app/(app)/accounting/_components/AccountingDataSkeleton';
import { MutationsBrowser } from '~/app/(app)/accounting/_components/MutationsBrowser';
import { PageTransition } from '~/components/PageTransition';
import { requireRootUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Mutations · Accounting Importer',
};

export default function MutationsPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-accounting__mutations',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        Recent mutations
                    </h1>
                </header>
                <Suspense fallback={<AccountingDataSkeleton />}>
                    <MutationsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function MutationsContent() {
    await requireRootUser();
    await api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <MutationsBrowser />
        </HydrateClient>
    );
}
