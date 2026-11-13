import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountDetailSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { AdvicePanel } from '~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel';
import { AccountDetailView } from '~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView';
import { openAccountPage } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountIdParameter';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { PageTransition } from '~/components/PageTransition';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

export const metadata: Metadata = {
    description:
        'One prop firm account: its plan rules, balance history, payouts, fees, lifecycle events and alerts.',
    title: 'Prop account',
};

export default function PropAccountDetailPage({
    params,
}: Pick<PageProps<'/prop-calculator/accounts/[id]'>, 'params'>) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__detail',
                    'container pt-spacing pb-24',
                )}
            >
                <Suspense fallback={<AccountDetailSkeleton />}>
                    <PropAccountDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountDetailContent({
    params,
}: Pick<PageProps<'/prop-calculator/accounts/[id]'>, 'params'>) {
    const { id, userId } = await openAccountPage(
        params,
        routes.propCalculator.accounts.detail,
    );
    await Promise.all([
        prefetch(trpc.propAccounts.externalFirm.list.queryOptions()),
        prefetch(
            trpc.propAccounts.snapshot.listForAccount.queryOptions({ id }),
        ),
        prefetch(trpc.propAccounts.payout.list.queryOptions({ accountId: id })),
        prefetch(trpc.propAccounts.fee.list.queryOptions({ accountId: id })),
        prefetch(trpc.propAccounts.event.listForAccount.queryOptions({ id })),
        prefetch(trpc.propAccounts.event.list.queryOptions(EVENT_LIST_INPUT)),
        prefetch(trpc.propAccounts.payout.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.copyGroup.list.queryOptions()),
        prefetch(trpc.propAccounts.snapshot.latestTwoForAll.queryOptions()),
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
        prefetch(
            trpc.propAccounts.decision.list.queryOptions(LEDGER_LIST_INPUT),
        ),
        prefetch(
            trpc.propAccounts.violation.list.queryOptions(LEDGER_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.fee.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.bankroll.list.queryOptions()),
        prefetch(trpc.propAccounts.rulebook.get.queryOptions()),
        prefetch(
            trpc.propAccounts.decision.listForAccount.queryOptions({ id }),
        ),
    ]);
    return (
        <HydrateClient>
            <AccountDetailView
                advice={<AdvicePanel id={id} />}
                id={id}
                userId={userId}
            />
        </HydrateClient>
    );
}
