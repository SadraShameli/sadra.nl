import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountingDataSkeleton } from '~/app/(app)/accounting/_components/AccountingDataSkeleton';
import { RunDetail } from '~/app/(app)/accounting/_components/RunDetail';
import { PageTransition } from '~/components/PageTransition';
import { requireRootUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { loadOrNotFound, routeIdOrNotFound } from '~/trpc/loadOrNotFound';
import { api, HydrateClient } from '~/trpc/server';

export default function AccountingRunDetailPage({
    params,
}: PageProps<'/accounting/runs/[id]'>) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-accounting__run-detail',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Run detail
                    </h1>
                </header>
                <Suspense fallback={<AccountingDataSkeleton />}>
                    <AccountingRunDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

export async function generateMetadata({
    params,
}: PageProps<'/accounting/runs/[id]'>): Promise<Metadata> {
    const { id } = await params;
    return {
        robots: { follow: false, index: false },
        title: `Run · ${id.slice(0, 8)} · Accounting Importer`,
    };
}

async function AccountingRunDetailContent({
    params,
}: Pick<PageProps<'/accounting/runs/[id]'>, 'params'>) {
    await requireRootUser();
    const { id } = await params;
    const run = await loadOrNotFound(() =>
        api.accounting.runs.get({ id: routeIdOrNotFound(id) }),
    );
    void api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <RunDetail initial={run} />
        </HydrateClient>
    );
}
