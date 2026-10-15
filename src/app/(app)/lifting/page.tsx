import { type Metadata } from 'next';
import { Suspense } from 'react';

import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { TodayHeroSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { TodayHero } from './_components/TodayHero';

export const metadata: Metadata = {
    description:
        'Track your workouts, log sets, follow programs, and watch your strength curve climb.',
    title: 'Lifting',
};

export default function LiftingTodayPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__today',
                    'container pt-spacing pb-24',
                )}
            >
                <LiftingPageHeader
                    description="A no-friction workout tracker."
                    title="Lifting"
                />
                <Suspense fallback={<TodayHeroSkeleton />}>
                    <LiftingTodayContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingTodayContent() {
    await requireSessionUser();
    void api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <TodayHero />
        </HydrateClient>
    );
}
