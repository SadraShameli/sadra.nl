import { type Metadata } from 'next';

import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { AccountEditor } from '../../_components/AccountForm';
import { openAccountPage } from '../../_components/detail/accountIdParameter';

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
    void api.propAccounts.copyGroup.list.prefetch();
    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-prop-accounts__edit',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Edit account
                    </h1>
                </header>
                <AccountEditor id={id} />
            </main>
        </HydrateClient>
    );
}
