import { type Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { Button } from '~/components/ui/button';
import { requireSessionUser } from '~/lib/auth/guards';
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

export default function PropAccountsPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__overview',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    action={
                        <Button asChild>
                            <Link href={routes.propCalculator.accounts.new}>
                                Add account
                            </Link>
                        </Button>
                    }
                    description="Spend, payouts received and net across every account you hold, with alerts and each account's stage and latest balance."
                    title="Prop accounts"
                />
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <PropAccountsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsContent() {
    const user = await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.index),
    );
    await Promise.all([
        api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT),
        api.propAccounts.externalFirm.list.prefetch(),
        api.propAccounts.snapshot.latestTwoForAll.prefetch(),
        api.propAccounts.copyGroup.list.prefetch(),
        api.propAccounts.rulebook.get.prefetch(),
        api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT),
        api.propAccounts.fee.list.prefetch(LEDGER_LIST_INPUT),
        api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT),
        api.propAccounts.decision.list.prefetch(LEDGER_LIST_INPUT),
        api.propAccounts.violation.list.prefetch(LEDGER_LIST_INPUT),
        api.propAccounts.bankroll.list.prefetch(),
        api.propAccounts.firmStatement.list.prefetch(),
        api.propAccounts.round.list.prefetch(),
        api.propAccounts.firmEngagement.list.prefetch(),
        api.propAccounts.edge.summary.prefetch(ALL_JOURNAL_DAYS),
    ]);
    return (
        <HydrateClient>
            <OverviewView userId={user.id} />
        </HydrateClient>
    );
}
