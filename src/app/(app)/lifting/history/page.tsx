import { type Metadata } from 'next';
import { Suspense } from 'react';

import { HistoryView } from '~/app/(app)/lifting/_components/HistoryView';
import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { HistoryViewSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Your training history.',
    title: 'Lifting history',
};

const MONTHS_BACK = 6;

export default function LiftingHistoryPage() {
    return (
        <PageTransition>
            <main className={cn('app-lifting__history', 'container pt-spacing pb-24')}>
                <LiftingPageHeader
                    description="The receipts. Tap any workout to revisit it."
                    title="History"
                />
                <Suspense fallback={<HistoryViewSkeleton />}>
                    <LiftingHistoryContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingHistoryContent() {
    await requireSessionUser();

    const from = new Date();
    from.setMonth(from.getMonth() - MONTHS_BACK);
    from.setHours(0, 0, 0, 0);

    void api.lifting.workout.list.prefetch({ from, limit: 200, offset: 0 });

    return (
        <HydrateClient>
            <HistoryView from={from} />
        </HydrateClient>
    );
}
