import { type ReactNode } from 'react';

import { requireSessionUser } from '~/lib/auth/guards';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

export async function LiftingUserSection({
    children,
}: {
    readonly children: ReactNode;
}) {
    await requireSessionUser();
    await prefetch(trpc.lifting.settings.get.queryOptions());
    return <HydrateClient>{children}</HydrateClient>;
}
