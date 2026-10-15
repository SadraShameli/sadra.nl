import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountEditor } from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { openAccountPage } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountIdParameter';
import { PageTransition } from '~/components/PageTransition';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Edit a prop firm account.',
    title: 'Edit account',
};

export default function EditPropAccountPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__edit',
                    'container pt-spacing pb-24',
                )}
            >
                <AccountsPageHeader
                    description="Change this account's plan, details and personal rules."
                    title="Edit account"
                />
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <EditPropAccountContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function EditPropAccountContent({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await openAccountPage(
        params,
        routes.propCalculator.accounts.edit,
    );
    void api.propAccounts.account.get.prefetch({ id });
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.copyGroup.list.prefetch();
    void api.propAccounts.externalFirm.list.prefetch();
    void api.propAccounts.round.list.prefetch();
    return (
        <HydrateClient>
            <AccountEditor id={id} />
        </HydrateClient>
    );
}
