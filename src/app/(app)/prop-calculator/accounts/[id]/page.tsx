import { type Metadata } from 'next';

import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { AccountDetailView } from '../_components/detail/AccountDetailView';
import { openAccountPage } from '../_components/detail/accountIdParameter';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '../_components/overview/overviewModel';

export const metadata: Metadata = {
    description:
        'One prop firm account: its plan rules, balance history, payouts, fees, lifecycle events and alerts.',
    title: 'Prop account',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id, userId } = await openAccountPage(
        params,
        routes.propCalculator.accounts.detail,
    );
    void api.propAccounts.snapshot.listForAccount.prefetch({ id });
    void api.propAccounts.payout.list.prefetch({ accountId: id });
    void api.propAccounts.fee.list.prefetch({ accountId: id });
    void api.propAccounts.event.listForAccount.prefetch({ id });
    void api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT);
    void api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.copyGroup.list.prefetch();
    void api.propAccounts.snapshot.latestForAll.prefetch();
    void api.propAccounts.rulebook.get.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__detail',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountDetailView id={id} userId={userId} />
            </main>
        </HydrateClient>
    );
}
