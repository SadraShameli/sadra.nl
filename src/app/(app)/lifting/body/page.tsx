import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { BodyView } from '../_components/BodyView';

export const metadata: Metadata = {
    description: 'Track bodyweight and tape measurements.',
    title: 'Body',
};

export const dynamic = 'force-dynamic';

export default async function LiftingBodyPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    void api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-lifting__body',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Body
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Track bodyweight and tape measurements.
                    </p>
                </header>
                <BodyView />
            </main>
        </HydrateClient>
    );
}
