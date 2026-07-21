import { type Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ExerciseDetail } from '~/app/(app)/lifting/_components/ExerciseDetail';
import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
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

export const dynamic = 'force-dynamic';

export default async function LiftingExerciseDetailPage({
    params,
}: PageProperties) {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    const { slug } = await params;
    try {
        const exercise = await api.lifting.exercise.get({ slug });
        void api.lifting.settings.get.prefetch();
        return (
            <HydrateClient>
                <main
                    className={cn(
                        'app-lifting__exercise-detail',
                        'container pt-spacing pb-24',
                    )}
                >
                    <ExerciseDetail exercise={exercise} />
                </main>
            </HydrateClient>
        );
    } catch {
        notFound();
    }
}
