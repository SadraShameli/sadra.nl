import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { WeeklyReviewSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

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
                <AccountsPageHeader
                    description={
                        <>
                            Enter this week&rsquo;s snapshot for every active
                            account, see the size change since last week, and
                            accept sizes into the decision log.
                        </>
                    }
                    title="Weekly review"
                />
                <Suspense fallback={<WeeklyReviewSkeleton />}>
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
    await Promise.all([
        prefetch(trpc.propAccounts.account.list.queryOptions({})),
        prefetch(trpc.propAccounts.snapshot.latestForAll.queryOptions()),
        prefetch(trpc.propAccounts.decision.latestForAll.queryOptions()),
        prefetch(trpc.propAccounts.rulebook.get.queryOptions()),
    ]);
    return (
        <HydrateClient>
            <WeeklyReviewView />
        </HydrateClient>
    );
}
