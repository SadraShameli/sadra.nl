import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { RunDetail } from '~/app/(app)/accounting/_components/RunDetail';
import { PageTransition } from '~/components/PageTransition';
import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

interface PageProperties {
    params: Promise<{ id: string }>;
}

export default function AccountingRunDetailPage({ params }: PageProperties) {
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
                <Suspense
                    fallback={
                        <Skeleton className="min-h-[36rem] w-full rounded-xl" />
                    }
                >
                    <AccountingRunDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function AccountingRunDetailContent({ params }: PageProperties) {
    const { id } = await params;
    const run = await loadRun(id);
    void api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <RunDetail initial={run} />
        </HydrateClient>
    );
}

async function loadRun(id: string) {
    try {
        return await api.accounting.runs.get({ id });
    } catch {
        notFound();
    }
}

export async function generateMetadata({
    params,
}: PageProperties): Promise<Metadata> {
    const { id } = await params;
    return {
        robots: { follow: false, index: false },
        title: `Run · ${id.slice(0, 8)} · Accounting Importer`,
    };
}
