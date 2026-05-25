import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

import { GoalsView } from '../_components/GoalsView';

export const metadata: Metadata = {
    description: 'Set and track lifting goals.',
    title: 'Goals',
};

export const dynamic = 'force-dynamic';

export default async function LiftingGoalsPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    void api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-lifting__goals',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Goals
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Set targets, track progress, celebrate the wins.
                    </p>
                </header>
                <GoalsView />
            </main>
        </HydrateClient>
    );
}
