import { notFound, redirect } from 'next/navigation';
import 'server-only';
import { z } from 'zod';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { getServerSession } from '~/lib/auth/server';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { api } from '~/trpc/server';

export interface AccountPageSession {
    readonly id: string;
    readonly userId: string;
}

const accountIdParameterSchema = z.uuid();

export async function openAccountPage(
    params: Promise<{ id: string }>,
    pageOf: (id: string) => string,
): Promise<AccountPageSession> {
    const { id: rawId } = await params;
    const parsedId = accountIdParameterSchema.safeParse(rawId);
    if (!parsedId.success) notFound();
    const id = parsedId.data.toLowerCase();
    const session = await getServerSession();
    if (!session?.user.id) {
        redirect(loginRedirectFor(pageOf(id)));
    }
    void api.propAccounts.account.get.prefetch({ id });
    void api.propAccounts.account.list.prefetch(ACCOUNT_LIST_INPUT);
    return { id, userId: session.user.id };
}
