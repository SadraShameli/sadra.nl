import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ExercisesBrowser } from '~/app/(app)/lifting/_components/ExercisesBrowser';
import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';

export const metadata: Metadata = {
    description: 'Browse exercises and add your own.',
    title: 'Exercises',
};

export default function LiftingExercisesPage() {
    return (
        <PageTransition>
            <main className={cn('app-lifting__exercises', 'container pt-spacing pb-24')}>
                <LiftingPageHeader
                    description="Browse the library or build your own."
                    title="Exercises"
                />
                <Suspense fallback={<ExercisesBrowser />}>
                    <LiftingExercisesContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingExercisesContent() {
    await requireSessionUser();
    return <ExercisesBrowser />;
}
