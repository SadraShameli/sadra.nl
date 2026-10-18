import { type Metadata } from 'next';
import { Suspense } from 'react';

import { LiftingDetailSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { WorkoutDetailView } from '~/app/(app)/lifting/_components/WorkoutDetail';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { loadOrNotFound, routeIdOrNotFound } from '~/trpc/loadOrNotFound';
import { api, HydrateClient } from '~/trpc/server';

export async function generateMetadata({
    params,
}: PageProps<'/lifting/workouts/[id]'>): Promise<Metadata> {
    const { id } = await params;
    return {
        description: 'Workout detail and history.',
        title: `Workout · ${id.slice(0, 8)}`,
    };
}

export default function LiftingWorkoutDetailPage({
    params,
}: PageProps<'/lifting/workouts/[id]'>) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__workout-detail',
                    'container pt-spacing pb-24',
                )}
            >
                <Suspense fallback={<LiftingDetailSkeleton />}>
                    <LiftingWorkoutDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingWorkoutDetailContent({
    params,
}: Pick<PageProps<'/lifting/workouts/[id]'>, 'params'>) {
    await requireSessionUser();
    const { id } = await params;
    const workout = await loadOrNotFound(() =>
        api.lifting.workout.get({ id: routeIdOrNotFound(id) }),
    );
    await api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <WorkoutDetailView initial={workout} />
        </HydrateClient>
    );
}
