import { notFound } from 'next/navigation';
import 'server-only';
import { z } from 'zod';

import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { requireSessionUser } from '~/lib/auth/guards';
import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { prefetch, trpc } from '~/trpc/server';

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
    const user = await requireSessionUser(loginRedirectFor(pageOf(id)));
    await Promise.all([
        prefetch(trpc.propAccounts.account.get.queryOptions({ id })),
        prefetch(
            trpc.propAccounts.account.list.queryOptions(ACCOUNT_LIST_INPUT),
        ),
    ]);
    return { id, userId: user.id };
}
