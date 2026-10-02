import { type Metadata } from 'next';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AdvicePanel } from '~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel';
import { AccountDetailView } from '~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView';
import { openAccountPage } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountIdParameter';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

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
    void api.propAccounts.externalFirm.list.prefetch();
    void api.propAccounts.snapshot.listForAccount.prefetch({ id });
    void api.propAccounts.payout.list.prefetch({ accountId: id });
    void api.propAccounts.fee.list.prefetch({ accountId: id });
    void api.propAccounts.event.listForAccount.prefetch({ id });
    void api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT);
    void api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.copyGroup.list.prefetch();
    void api.propAccounts.snapshot.latestTwoForAll.prefetch();
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.decision.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.violation.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.fee.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.bankroll.list.prefetch();
    void api.propAccounts.rulebook.get.prefetch();
    void api.propAccounts.decision.listForAccount.prefetch({ id });
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__detail',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountDetailView id={id} userId={userId} />
                <AdvicePanel id={id} />
            </main>
        </HydrateClient>
    );
}
