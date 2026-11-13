import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { NextSlotSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

import { NextSlotView } from './NextSlotView';

export const metadata: Metadata = {
    description:
        'Which prop plan to buy next, ranked by modeled monthly net per slot within your verified account caps.',
    title: 'Next slot',
};

export default function PropAccountsNextSlotPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__next-slot',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description={
                        <>
                            Which plan to buy next, ranked by modeled monthly
                            net per slot under your documented payout rule, with
                            the payout-size optimum beside it. Firms with
                            unverified caps or live triggers are listed, never
                            ranked.
                        </>
                    }
                    title="Next slot"
                />
                <Suspense fallback={<NextSlotSkeleton />}>
                    <PropAccountsNextSlotContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsNextSlotContent() {
    const user = await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.nextSlot),
    );
    await Promise.all([
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.event.list.queryOptions(EVENT_LIST_INPUT)),
        prefetch(trpc.propAccounts.fee.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.payout.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.bankroll.list.queryOptions()),
        prefetch(trpc.propAccounts.firmEngagement.list.queryOptions()),
        prefetch(trpc.propAccounts.rulebook.get.queryOptions()),
        prefetch(trpc.propAccounts.edge.summary.queryOptions(ALL_JOURNAL_DAYS)),
    ]);
    return (
        <HydrateClient>
            <NextSlotView userId={user.id} />
        </HydrateClient>
    );
}
