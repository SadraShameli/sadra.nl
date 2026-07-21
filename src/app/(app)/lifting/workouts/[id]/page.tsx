import { type Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { WorkoutDetailView } from '~/app/(app)/lifting/_components/WorkoutDetail';
import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

interface PageProperties {
    params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: PageProperties): Promise<Metadata> {
    const { id } = await params;
    return {
        description: 'Workout detail and history.',
        title: `Workout · ${id.slice(0, 8)}`,
    };
}

export default async function LiftingWorkoutDetailPage({
    params,
}: PageProperties) {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    const { id } = await params;
    try {
        const workout = await api.lifting.workout.get({ id });
        void api.lifting.settings.get.prefetch();
        return (
            <HydrateClient>
                <main
                    className={cn(
                        'app-lifting__workout-detail',
                        'container pt-spacing pb-24',
                    )}
                >
                    <WorkoutDetailView initial={workout} />
                </main>
            </HydrateClient>
        );
    } catch {
        notFound();
    }
}
