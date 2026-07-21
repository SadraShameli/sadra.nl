import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { ExercisesBrowser } from '../_components/ExercisesBrowser';

export const metadata: Metadata = {
    description: 'Browse exercises and add your own.',
    title: 'Exercises',
};

export const dynamic = 'force-dynamic';

export default async function LiftingExercisesPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    return (
        <main
            className={cn(
                'app-lifting__exercises',
                'container pt-spacing pb-24',
            )}
        >
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Exercises
                </h1>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                    Browse the library or build your own.
                </p>
            </header>
            <ExercisesBrowser />
        </main>
    );
}
