import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { getServerSession } from '~/lib/auth/server';
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

export const dynamic = 'force-dynamic';

export default async function PropAccountsFirmsPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.firms));
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT);
    void api.propAccounts.fee.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.externalFirm.list.prefetch();
    void api.propAccounts.firmEngagement.list.prefetch();
    void api.propAccounts.rulebook.get.prefetch();
    void api.propAccounts.edge.summary.prefetch(ALL_JOURNAL_DAYS);
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__firms',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Firms
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Your firm roster with status, measured live-transfer
                        rates and scale readiness.
                    </p>
                </header>
                <FirmsView />
            </main>
        </HydrateClient>
    );
}
