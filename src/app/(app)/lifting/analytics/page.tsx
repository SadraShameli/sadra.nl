import { type Metadata } from 'next';
import { Suspense } from 'react';

import {
    AnalyticsDashboard,
    AnalyticsDashboardSkeleton,
} from '~/app/(app)/lifting/_components/AnalyticsDashboard';
import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Charts, PRs, volume, frequency.',
    title: 'Lifting analytics',
};

export default function LiftingAnalyticsPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__analytics',
                    'container pt-spacing pb-24',
                )}
            >
                <LiftingPageHeader
                    description="Volume, frequency, and strength curves."
                    title="Analytics"
                />
                <Suspense fallback={<AnalyticsDashboardSkeleton />}>
                    <LiftingAnalyticsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingAnalyticsContent() {
    await requireSessionUser();
    await api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <AnalyticsDashboard />
        </HydrateClient>
    );
}
