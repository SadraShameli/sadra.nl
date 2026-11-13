import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { FirmsSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
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

import { FirmsView } from './FirmsView';

export const metadata: Metadata = {
    description:
        'Your firm roster with status, measured live-transfer rates and scale readiness.',
    title: 'Firms',
};

export default function PropAccountsFirmsPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__firms',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description={
                        <>
                            Your firm roster with status, measured live-transfer
                            rates and scale readiness.
                        </>
                    }
                    title="Firms"
                />
                <Suspense fallback={<FirmsSkeleton />}>
                    <PropAccountsFirmsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsFirmsContent() {
    await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.firms),
    );
    await Promise.all([
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.event.list.queryOptions(EVENT_LIST_INPUT)),
        prefetch(trpc.propAccounts.fee.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.payout.list.queryOptions(LEDGER_LIST_INPUT)),
        prefetch(trpc.propAccounts.externalFirm.list.queryOptions()),
        prefetch(trpc.propAccounts.firmEngagement.list.queryOptions()),
        prefetch(trpc.propAccounts.rulebook.get.queryOptions()),
        prefetch(trpc.propAccounts.edge.summary.queryOptions(ALL_JOURNAL_DAYS)),
    ]);
    return (
        <HydrateClient>
            <FirmsView />
        </HydrateClient>
    );
}
