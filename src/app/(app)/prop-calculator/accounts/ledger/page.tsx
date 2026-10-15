import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

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
    void api.propAccounts.externalFirm.list.prefetch();
    void api.propAccounts.payout.list.prefetch({});
    void api.propAccounts.fee.list.prefetch({});
    void api.propAccounts.bankroll.list.prefetch();
    void api.propAccounts.firmStatement.list.prefetch();
    return (
        <HydrateClient>
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
                <LedgerView />
            </main>
        </HydrateClient>
    );
}
