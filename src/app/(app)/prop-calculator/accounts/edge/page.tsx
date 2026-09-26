import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { EdgeView } from './EdgeView';

export const metadata: Metadata = {
    description:
        'Your trade journal win rate and expectancy next to the rulebook assumptions, display only.',
    title: 'Journal edge',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsEdgePage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.edge));
    }
    void api.propAccounts.edge.summary.prefetch(ALL_JOURNAL_DAYS);
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__edge',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Journal edge
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Your journal&apos;s win rate and expectancy next to the
                        win rate and reward to risk your rulebook assumes.
                    </p>
                </header>
                <EdgeView />
            </main>
        </HydrateClient>
    );
}
