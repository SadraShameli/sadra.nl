import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AccountCreator } from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    type AccountPrefillParameters,
    accountPrefillQuery,
    parseAccountPrefill,
} from '~/app/(app)/prop-calculator/accounts/_components/accountPrefill';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Add a prop firm account.',
    title: 'Add account',
};

export default function NewPropAccountPage({
    searchParams,
}: {
    searchParams: Promise<AccountPrefillParameters>;
}) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__new',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description="Pick the firm and plan, then enter what the firm dashboard shows today."
                    title="Add account"
                />
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <NewPropAccountContent searchParams={searchParams} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function NewPropAccountContent({
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
    void api.propAccounts.round.list.prefetch();
    return (
        <HydrateClient>
            <AccountCreator
                initialFirm={prefill.firmId}
                initialOptIns={prefill.optIns}
                initialPlan={prefill.planSerial}
            />
        </HydrateClient>
    );
}
