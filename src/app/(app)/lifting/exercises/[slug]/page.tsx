import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { LiftingDetailSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { ExerciseDetail } from '~/app/(app)/lifting/_components/ExerciseDetail';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

interface PageProperties {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({
    params,
}: PageProperties): Promise<Metadata> {
    const { slug } = await params;
    return {
        description: 'Exercise detail with history and PRs.',
        title: `Lifting · ${slug}`,
    };
}

export default function LiftingExerciseDetailPage({ params }: PageProperties) {
    return (
        <PageTransition>
            <main className={cn('app-lifting__exercise-detail', 'container pt-spacing pb-24')}>
                <Suspense fallback={<LiftingDetailSkeleton />}>
                    <LiftingExerciseDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingExerciseDetailContent({ params }: PageProperties) {
    await requireSessionUser();
    const { slug } = await params;
    const exercise = await loadLiftingExerciseDetail(slug);
    void api.lifting.settings.get.prefetch();
    return <HydrateClient><ExerciseDetail exercise={exercise} /></HydrateClient>;
}

async function loadLiftingExerciseDetail(slug: string) {
    try {
        return await api.lifting.exercise.get({ slug });
    } catch {
        notFound();
    }
}
