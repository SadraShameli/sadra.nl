import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { ACCOUNT_LIST_INPUT } from './_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from './_components/overview/overviewModel';
import { OverviewView } from './_components/overview/OverviewView';

export const metadata: Metadata = {
    description:
        'Your prop firm accounts: spend, payouts received and net, alerts, and every account with its stage and latest balance.',
    title: 'Prop accounts',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.index));
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.externalFirm.list.prefetch();
    void api.propAccounts.snapshot.latestTwoForAll.prefetch();
    void api.propAccounts.copyGroup.list.prefetch();
    void api.propAccounts.rulebook.get.prefetch();
    void api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.fee.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT);
    void api.propAccounts.decision.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.violation.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.bankroll.list.prefetch();
    void api.propAccounts.firmStatement.list.prefetch();
    void api.propAccounts.round.list.prefetch();
    void api.propAccounts.firmEngagement.list.prefetch();
    void api.propAccounts.edge.summary.prefetch(ALL_JOURNAL_DAYS);
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__overview',
                    'container pt-spacing pb-24',
                )}
            >
                <OverviewView userId={session.user.id} />
            </main>
        </HydrateClient>
    );
}
