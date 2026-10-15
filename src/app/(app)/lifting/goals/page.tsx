import { type Metadata } from 'next';
import { Suspense } from 'react';

import { GoalsView } from '~/app/(app)/lifting/_components/GoalsView';
import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { GoalsViewSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Set and track lifting goals.',
    title: 'Goals',
};

export default function LiftingGoalsPage() {
    return (
        <PageTransition>
            <main className={cn('app-lifting__goals', 'container pt-spacing pb-24')}>
                <LiftingPageHeader
                    description="Set targets, track progress, celebrate the wins."
                    title="Goals"
                />
                <Suspense fallback={<GoalsViewSkeleton />}>
                    <LiftingGoalsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingGoalsContent() {
    await requireSessionUser();
    void api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <GoalsView />
        </HydrateClient>
    );
}
