import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
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

export default function PropAccountsEdgePage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__edge',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description={
                        <>
                            Your journal&apos;s win rate and expectancy next to
                            the win rate and reward to risk your rulebook
                            assumes.
                        </>
                    }
                    title="Journal edge"
                />
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <PropAccountsEdgeContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsEdgeContent() {
    await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.edge),
    );
    await api.propAccounts.edge.summary.prefetch(ALL_JOURNAL_DAYS);
    return (
        <HydrateClient>
            <EdgeView />
        </HydrateClient>
    );
}
