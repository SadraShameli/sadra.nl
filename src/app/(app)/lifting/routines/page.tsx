import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';

import { RoutinesView } from '../_components/RoutinesView';

export const metadata: Metadata = {
    description: 'Quick-start workout templates.',
    title: 'Routines',
};

export const dynamic = 'force-dynamic';

export default async function LiftingRoutinesPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    return (
        <main
            className={cn(
                'app-lifting__routines',
                'container pt-spacing pb-24',
            )}
        >
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Routines
                </h1>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                    Save and replay your favorite workouts.
                </p>
            </header>
            <RoutinesView />
        </main>
    );
}
