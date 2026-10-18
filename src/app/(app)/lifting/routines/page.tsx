import { type Metadata } from 'next';
import { Suspense } from 'react';

import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { RoutinesViewSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { RoutinesView } from '~/app/(app)/lifting/_components/RoutinesView';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';

export const metadata: Metadata = {
    description: 'Quick-start workout templates.',
    title: 'Routines',
};

export default function LiftingRoutinesPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__routines',
                    'container pt-spacing pb-24',
                )}
            >
                <LiftingPageHeader
                    description="Save and replay your favorite workouts."
                    title="Routines"
                />
                <Suspense fallback={<RoutinesViewSkeleton />}>
                    <LiftingRoutinesContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingRoutinesContent() {
    await requireSessionUser();
    return <RoutinesView />;
}
