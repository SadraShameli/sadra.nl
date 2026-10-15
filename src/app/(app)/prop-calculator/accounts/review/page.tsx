import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { WeeklyReviewView } from './WeeklyReviewView';

export const metadata: Metadata = {
    description:
        'Enter this week’s snapshot for every active account, with plausibility checks, the size change since last week, and accepted sizes into the decision log.',
    title: 'Weekly review',
};

export default function PropAccountsReviewPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__review',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Weekly review
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Enter this week&rsquo;s snapshot for every active
                        account, see the size change since last week, and accept
                        sizes into the decision log.
                    </p>
                </header>
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <PropAccountsReviewContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsReviewContent() {
    await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.review),
    );
    void api.propAccounts.account.list.prefetch({});
    void api.propAccounts.snapshot.latestForAll.prefetch();
    void api.propAccounts.decision.latestForAll.prefetch();
    void api.propAccounts.rulebook.get.prefetch();
    return (
        <HydrateClient>
            <WeeklyReviewView />
        </HydrateClient>
    );
}
