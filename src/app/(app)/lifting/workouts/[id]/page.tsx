import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { LiftingDetailSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { WorkoutDetailView } from '~/app/(app)/lifting/_components/WorkoutDetail';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

interface PageProperties {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({
    params,
}: PageProperties): Promise<Metadata> {
    const { id } = await params;
    return {
        description: 'Workout detail and history.',
        title: `Workout · ${id.slice(0, 8)}`,
    };
}

export default function LiftingWorkoutDetailPage({ params }: PageProperties) {
    return (
        <PageTransition>
            <main className={cn('app-lifting__workout-detail', 'container pt-spacing pb-24')}>
                <Suspense fallback={<LiftingDetailSkeleton />}>
                    <LiftingWorkoutDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingWorkoutDetailContent({ params }: PageProperties) {
    await requireSessionUser();
    const { id } = await params;
    const workout = await loadLiftingWorkoutDetail(id);
    void api.lifting.settings.get.prefetch();
    return <HydrateClient><WorkoutDetailView initial={workout} /></HydrateClient>;
}

async function loadLiftingWorkoutDetail(id: string) {
    try {
        return await api.lifting.workout.get({ id });
    } catch {
        notFound();
    }
}
