import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { ACCOUNT_LIST_INPUT } from '../_components/accountListFilters';
import { LedgerView } from './LedgerView';

export const metadata: Metadata = {
    description: 'Every prop firm payout and fee, filterable and exportable.',
    title: 'Ledger',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsLedgerPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.ledger));
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.payout.list.prefetch({});
    void api.propAccounts.fee.list.prefetch({});
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__ledger',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Ledger
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Every payout and fee across your accounts. Filter it and
                        export exactly what you see as CSV.
                    </p>
                </header>
                <LedgerView />
            </main>
        </HydrateClient>
    );
}
