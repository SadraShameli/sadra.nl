import { type Metadata } from 'next';
import { Suspense } from 'react';

import { AccountEditor } from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { AccountFormSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { openAccountPage } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountIdParameter';
import { PageTransition } from '~/components/PageTransition';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Edit a prop firm account.',
    title: 'Edit account',
};

export default function EditPropAccountPage({
    params,
}: Pick<PageProps<'/prop-calculator/accounts/[id]/edit'>, 'params'>) {
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
                <Suspense fallback={<AccountFormSkeleton />}>
                    <EditPropAccountContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function EditPropAccountContent({
    params,
}: Pick<PageProps<'/prop-calculator/accounts/[id]/edit'>, 'params'>) {
    const { id } = await openAccountPage(
        params,
        routes.propCalculator.accounts.edit,
    );
    await Promise.all([
        prefetch(trpc.propAccounts.account.get.queryOptions({ id })),
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
        prefetch(trpc.propAccounts.copyGroup.list.queryOptions()),
        prefetch(trpc.propAccounts.externalFirm.list.queryOptions()),
        prefetch(trpc.propAccounts.round.list.queryOptions()),
    ]);
    return (
        <HydrateClient>
            <AccountEditor id={id} />
        </HydrateClient>
    );
}
