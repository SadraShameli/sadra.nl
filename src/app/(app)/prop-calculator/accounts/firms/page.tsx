import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
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
import { api, HydrateClient } from '~/trpc/server';

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
                <Suspense fallback={<AccountsDataSkeleton />}>
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
        api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT),
        api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT),
        api.propAccounts.fee.list.prefetch(LEDGER_LIST_INPUT),
        api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT),
        api.propAccounts.externalFirm.list.prefetch(),
        api.propAccounts.firmEngagement.list.prefetch(),
        api.propAccounts.rulebook.get.prefetch(),
        api.propAccounts.edge.summary.prefetch(ALL_JOURNAL_DAYS),
    ]);
    return (
        <HydrateClient>
            <FirmsView />
        </HydrateClient>
    );
}
