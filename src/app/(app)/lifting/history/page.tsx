import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

import { HistoryView } from '../_components/HistoryView';

export const metadata: Metadata = {
    description: 'Your training history.',
    title: 'Lifting history',
};

export const dynamic = 'force-dynamic';

const MONTHS_BACK = 6;

export default async function LiftingHistoryPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);

    const from = new Date();
    from.setMonth(from.getMonth() - MONTHS_BACK);
    from.setHours(0, 0, 0, 0);

    void api.lifting.workout.list.prefetch({ from, limit: 200, offset: 0 });

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-lifting__history',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        History
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        The receipts. Tap any workout to revisit it.
                    </p>
                </header>
                <HistoryView from={from} />
            </main>
        </HydrateClient>
    );
}
