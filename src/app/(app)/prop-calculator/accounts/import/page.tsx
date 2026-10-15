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

import { ImportView } from './ImportView';

export const metadata: Metadata = {
    description: 'Import prop firm accounts and balance snapshots from CSV.',
    title: 'Import accounts',
};

export default function PropAccountsImportPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__import',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description="Paste or upload a CSV of accounts or balance snapshots. Every row is checked before anything is saved, and nothing is saved while any row has an issue."
                    title="Import"
                />
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <PropAccountsImportContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsImportContent() {
    await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.import),
    );
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.externalFirm.list.prefetch();
    return (
        <HydrateClient>
            <ImportView />
        </HydrateClient>
    );
}
