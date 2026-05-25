import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

import { TodayHero } from './_components/TodayHero';

export const metadata: Metadata = {
    description:
        'Track your workouts, log sets, follow programs, and watch your strength curve climb.',
    title: 'Lifting',
};

export const dynamic = 'force-dynamic';

export default async function LiftingTodayPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    void api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-lifting__today',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Lifting
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                        A no-friction workout tracker.
                    </p>
                </header>
                <TodayHero />
            </main>
        </HydrateClient>
    );
}
