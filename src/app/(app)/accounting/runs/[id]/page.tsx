import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { RunDetail } from '../../_components/RunDetail';

interface PageProperties {
    params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function AccountingRunDetailPage({
    params,
}: PageProperties) {
    const { id } = await params;
    try {
        const run = await api.accounting.runs.get({ id });
        void api.accounting.credentials.list.prefetch();
        return (
            <HydrateClient>
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
                    <RunDetail initial={run} />
                </main>
            </HydrateClient>
        );
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
