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
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

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
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.externalFirm.list.queryOptions()),
        prefetch(trpc.propAccounts.payout.list.queryOptions({})),
        prefetch(trpc.propAccounts.fee.list.queryOptions({})),
        prefetch(trpc.propAccounts.bankroll.list.queryOptions()),
        prefetch(trpc.propAccounts.firmStatement.list.queryOptions()),
    ]);
    return (
        <HydrateClient>
            <LedgerView />
        </HydrateClient>
    );
}
