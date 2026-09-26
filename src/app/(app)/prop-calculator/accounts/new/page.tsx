import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { AccountCreator } from '../_components/AccountForm';
import { ACCOUNT_LIST_INPUT } from '../_components/accountListFilters';

export const metadata: Metadata = {
    description: 'Add a prop firm account.',
    title: 'Add account',
};

export const dynamic = 'force-dynamic';

type SearchParameters = Record<string, string | string[] | undefined>;

export default async function NewPropAccountPage({
    searchParams,
}: {
    searchParams: Promise<SearchParameters>;
}) {
    const parameters = await searchParams;
    const firm = firstValue(parameters.firm);
    const plan = firstValue(parameters.plan);
    const session = await getServerSession();
    if (!session?.user.id) {
        const query = new URLSearchParams();
        if (firm !== undefined) query.set('firm', firm);
        if (plan !== undefined) query.set('plan', plan);
        redirect(
            loginRedirectFor(
                routes.propCalculator.accounts.new,
                query.toString(),
            ),
        );
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.copyGroup.list.prefetch();
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
                    initialFirm={firm ?? null}
                    initialPlan={plan ?? null}
                />
            </main>
        </HydrateClient>
    );
}

function firstValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}
