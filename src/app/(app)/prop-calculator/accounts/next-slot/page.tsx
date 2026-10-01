import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { getServerSession } from '~/lib/auth/server';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { NextSlotView } from './NextSlotView';

export const metadata: Metadata = {
    description:
        'Which prop plan to buy next, ranked by modeled monthly net per slot within your verified account caps.',
    title: 'Next slot',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsNextSlotPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.nextSlot));
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT);
    void api.propAccounts.fee.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.bankroll.list.prefetch();
    void api.propAccounts.firmEngagement.list.prefetch();
    void api.propAccounts.rulebook.get.prefetch();
    void api.propAccounts.edge.summary.prefetch(ALL_JOURNAL_DAYS);
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__next-slot',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Next slot
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
                        Which plan to buy next, ranked by modeled monthly net
                        per slot under your documented payout rule, with the
                        payout-size optimum beside it. Firms with unverified
                        caps or live triggers are listed, never ranked.
                    </p>
                </header>
                <NextSlotView userId={session.user.id} />
            </main>
        </HydrateClient>
    );
}
