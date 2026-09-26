import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { ACCOUNT_LIST_INPUT } from '../_components/accountListFilters';
import { CopyGroupsView } from './CopyGroupsView';

export const metadata: Metadata = {
    description:
        'Group the prop accounts your trade copier trades together, one stage per group.',
    title: 'Copy groups',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsCopyGroupsPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.copyGroups));
    }
    void api.propAccounts.copyGroup.list.prefetch();
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__copy-groups',
                    'container pt-spacing pb-24',
                )}
            >
                <CopyGroupsView />
            </main>
        </HydrateClient>
    );
}
