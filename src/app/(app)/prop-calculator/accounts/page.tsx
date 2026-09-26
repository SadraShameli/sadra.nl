import { type Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '~/components/ui/Button';
import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { ACCOUNT_LIST_INPUT } from './_components/accountListFilters';
import { AccountsTable } from './_components/AccountsTable';

export const metadata: Metadata = {
    description: 'Your prop firm accounts, balances and stages.',
    title: 'Prop accounts',
};

export const dynamic = 'force-dynamic';

export default async function PropAccountsPage() {
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.index));
    }
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    void api.propAccounts.snapshot.latestForAll.prefetch();
    void api.propAccounts.copyGroup.list.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__overview',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Prop accounts
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                            Every account you hold, its stage and its latest
                            balance.
                        </p>
                    </div>
                    <Button asChild>
                        <Link href={routes.propCalculator.accounts.new}>
                            Add account
                        </Link>
                    </Button>
                </header>
                <AccountsTable />
            </main>
        </HydrateClient>
    );
}
