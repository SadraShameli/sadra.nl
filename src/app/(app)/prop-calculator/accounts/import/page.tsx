import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { ImportView } from './ImportView';

export const metadata: Metadata = {
    description: 'Import prop firm accounts and balance snapshots from CSV.',
    title: 'Import accounts',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsImportPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.import));
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.externalFirm.list.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__import',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Import
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Paste or upload a CSV of accounts or balance snapshots.
                        Every row is checked before anything is saved, and
                        nothing is saved while any row has an issue.
                    </p>
                </header>
                <ImportView />
            </main>
        </HydrateClient>
    );
}
