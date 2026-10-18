import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { LedgerView } from './LedgerView';

export const metadata: Metadata = {
    description: 'Every prop firm payout and fee, filterable and exportable.',
    title: 'Ledger',
};

export default function PropAccountsLedgerPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__ledger',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description="Every payout and fee across your accounts. Filter it and export exactly what you see as CSV."
                    title="Ledger"
                />
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <PropAccountsLedgerContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsLedgerContent() {
    await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.ledger),
    );
    await Promise.all([
        api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT),
        api.propAccounts.externalFirm.list.prefetch(),
        api.propAccounts.payout.list.prefetch({}),
        api.propAccounts.fee.list.prefetch({}),
        api.propAccounts.bankroll.list.prefetch(),
        api.propAccounts.firmStatement.list.prefetch(),
    ]);
    return (
        <HydrateClient>
            <LedgerView />
        </HydrateClient>
    );
}
