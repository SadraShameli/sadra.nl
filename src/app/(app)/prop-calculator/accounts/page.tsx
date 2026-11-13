import { type Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { OverviewSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { Button } from '~/components/ui/button';
import { requireSessionUser } from '~/lib/auth/guards';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

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
                <Suspense fallback={<OverviewSkeleton />}>
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
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.externalFirm.list.queryOptions()),
        prefetch(trpc.propAccounts.snapshot.latestTwoForAll.queryOptions()),
        prefetch(trpc.propAccounts.copyGroup.list.queryOptions()),
        prefetch(trpc.propAccounts.rulebook.get.queryOptions()),
        prefetch(trpc.propAccounts.payout.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.fee.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.event.list.queryOptions(EVENT_LIST_INPUT)),
        prefetch(
            trpc.propAccounts.decision.list.queryOptions(LEDGER_LIST_INPUT),
        ),
        prefetch(
            trpc.propAccounts.violation.list.queryOptions(LEDGER_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.bankroll.list.queryOptions()),
        prefetch(trpc.propAccounts.firmStatement.list.queryOptions()),
        prefetch(trpc.propAccounts.round.list.queryOptions()),
        prefetch(trpc.propAccounts.firmEngagement.list.queryOptions()),
        prefetch(trpc.propAccounts.edge.summary.queryOptions(ALL_JOURNAL_DAYS)),
    ]);
    return (
        <HydrateClient>
            <OverviewView userId={user.id} />
        </HydrateClient>
    );
}
