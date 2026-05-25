import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api } from '~/trpc/server';

import { LogShell } from '../_components/log/LogShell';

export const metadata: Metadata = {
    description: 'Log a workout — one tap per set.',
    title: 'Log',
};

export const dynamic = 'force-dynamic';

export default async function LiftingLogPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    const settings = await api.lifting.settings.get();
    return (
        <main className={cn('app-lifting__log', 'container pt-spacing pb-24')}>
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Log
                </h1>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                    One tap per set. Quick capture, no friction.
                </p>
            </header>
            <LogShell initialSettings={settings} />
        </main>
    );
}
