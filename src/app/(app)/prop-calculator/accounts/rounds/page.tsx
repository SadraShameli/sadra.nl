import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { RoundsSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

import { RoundsView } from './RoundsView';

export const metadata: Metadata = {
    description:
        'Group purchases into rounds with an optional budget, and see spend, payouts and realized multiple per round.',
    title: 'Rounds',
};

export default function PropAccountsRoundsPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__rounds',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description={
                        <>
                            Group your purchases into rounds with an optional
                            budget, and see spend, payouts and realized multiple
                            per round.
                        </>
                    }
                    title="Rounds"
                />
                <Suspense fallback={<RoundsSkeleton />}>
                    <PropAccountsRoundsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsRoundsContent() {
    await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.rounds),
    );
    await Promise.all([
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.event.list.queryOptions(EVENT_LIST_INPUT)),
        prefetch(trpc.propAccounts.fee.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.payout.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.round.list.queryOptions()),
        prefetch(trpc.propAccounts.externalFirm.list.queryOptions()),
        prefetch(trpc.propAccounts.rulebook.get.queryOptions()),
    ]);
    return (
        <HydrateClient>
            <RoundsView />
        </HydrateClient>
    );
}
