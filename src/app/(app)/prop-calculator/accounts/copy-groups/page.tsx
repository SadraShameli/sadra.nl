import { type Metadata } from 'next';
import { Suspense } from 'react';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { AccountsDataSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { CopyGroupsView } from './CopyGroupsView';

export const metadata: Metadata = {
    description:
        'Group the prop accounts your trade copier trades together, one stage per group.',
    title: 'Copy groups',
};

export default function PropAccountsCopyGroupsPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-prop-accounts__copy-groups',
                    'container pt-spacing pb-24',
                )}
            >
                <Suspense fallback={<AccountsDataSkeleton />}>
                    <PropAccountsCopyGroupsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function PropAccountsCopyGroupsContent() {
    const user = await requireSessionUser(
        loginRedirectFor(routes.propCalculator.accounts.copyGroups),
    );
    void api.propAccounts.copyGroup.list.prefetch();
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.event.list.prefetch(EVENT_LIST_INPUT);
    void api.propAccounts.payout.list.prefetch(LEDGER_LIST_INPUT);
    void api.propAccounts.rulebook.get.prefetch();
    void api.propAccounts.snapshot.latestForAll.prefetch();
    return (
        <HydrateClient>
            <CopyGroupsView userId={user.id} />
        </HydrateClient>
    );
}
