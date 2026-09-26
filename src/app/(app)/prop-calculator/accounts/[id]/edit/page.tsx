import { type Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

import { AccountEditor } from '../../_components/AccountForm';
import { ACCOUNT_LIST_INPUT } from '../../_components/accountListFilters';

export const metadata: Metadata = {
    description: 'Edit a prop firm account.',
    title: 'Edit account',
};

export const dynamic = 'force-dynamic';

const accountIdParameterSchema = z.uuid();

export default async function EditPropAccountPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: rawId } = await params;
    const parsedId = accountIdParameterSchema.safeParse(rawId);
    if (!parsedId.success) notFound();
    const id = parsedId.data.toLowerCase();
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(routes.propCalculator.accounts.edit(id)));
    }
    void api.propAccounts.account.get.prefetch({ id });
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
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
