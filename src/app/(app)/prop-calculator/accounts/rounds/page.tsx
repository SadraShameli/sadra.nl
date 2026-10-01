import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { RoundsView } from './RoundsView';

export const metadata: Metadata = {
    description:
        'Group purchases into rounds with an optional budget, and see spend, payouts and realized multiple per round.',
    title: 'Rounds',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsRoundsPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.rounds));
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT);
    void api.propAccounts.fee.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.round.list.prefetch();
    void api.propAccounts.externalFirm.list.prefetch();
    void api.propAccounts.rulebook.get.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__rounds',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Rounds
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Group your purchases into rounds with an optional
                        budget, and see spend, payouts and realized multiple
                        per round.
                    </p>
                </header>
                <RoundsView />
            </main>
        </HydrateClient>
    );
}
