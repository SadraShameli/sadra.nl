import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { AnalyticsDashboard } from '../_components/AnalyticsDashboard';

export const metadata: Metadata = {
    description: 'Charts, PRs, volume, frequency.',
    title: 'Lifting analytics',
};

export const dynamic = 'force-dynamic';

export default async function LiftingAnalyticsPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    void api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-lifting__analytics',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Analytics
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Volume, frequency, and strength curves.
                    </p>
                </header>
                <AnalyticsDashboard />
            </main>
        </HydrateClient>
    );
}
