import { type ReactNode } from 'react';

import { requireSessionUser } from '~/lib/auth/guards';
import { api, HydrateClient } from '~/trpc/server';

export async function LiftingUserSection({
    children,
}: {
    readonly children: ReactNode;
}) {
    await requireSessionUser();
    await api.lifting.settings.get.prefetch();
    return <HydrateClient>{children}</HydrateClient>;
}
