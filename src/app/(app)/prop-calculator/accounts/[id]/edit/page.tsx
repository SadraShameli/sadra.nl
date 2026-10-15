import { type Metadata } from 'next';

import { AccountEditor } from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { openAccountPage } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountIdParameter';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Edit a prop firm account.',
    title: 'Edit account',
};

export const dynamic = 'force-dynamic';

export default async function EditPropAccountPage({
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
                <AccountEditor id={id} />
            </main>
        </HydrateClient>
    );
}
