import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountCreator } from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    type AccountPrefillParameters,
    accountPrefillQuery,
    parseAccountPrefill,
} from '~/app/(app)/prop-calculator/accounts/_components/accountPrefill';
import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Add a prop firm account.',
    title: 'Add account',
};

export const dynamic = 'force-dynamic';

export default async function NewPropAccountPage({
    searchParams,
}: {
    searchParams: Promise<AccountPrefillParameters>;
}) {
    const prefill = parseAccountPrefill(await searchParams);
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(
            loginRedirectFor(
                routes.propCalculator.accounts.new,
                accountPrefillQuery(prefill),
            ),
        );
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.copyGroup.list.prefetch();
    void api.propAccounts.externalFirm.list.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__new',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Add account
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Pick the firm and plan, then enter what the firm
                        dashboard shows today.
                    </p>
                </header>
                <AccountCreator
                    initialFirm={prefill.firmId}
                    initialOptIns={prefill.optIns}
                    initialPlan={prefill.planSerial}
                />
            </main>
        </HydrateClient>
    );
}
