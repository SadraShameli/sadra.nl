import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { RunDetail } from '~/app/(app)/accounting/_components/RunDetail';
import { requireRootUser } from '~/lib/auth/guards';
import { loadOrNotFound, routeIdOrNotFound } from '~/trpc/loadOrNotFound';
import { api, HydrateClient } from '~/trpc/server';

export default function AccountingRunDetailPage({
    params,
}: PageProps<'/accounting/runs/[id]'>) {
    return (
        <AccountingPageFrame
            className="app-accounting__run-detail"
            section={AccountingSection.RunDetail}
        >
            <AccountingRunDetailContent params={params} />
        </AccountingPageFrame>
    );
}

export async function generateMetadata({
    params,
}: PageProps<'/accounting/runs/[id]'>): Promise<Metadata> {
    const { id } = await params;
    return {
        robots: { follow: false, index: false },
        title: `Run · ${id.slice(0, 8)} · Accounting Importer`,
    };
}

async function AccountingRunDetailContent({
    params,
}: Pick<PageProps<'/accounting/runs/[id]'>, 'params'>) {
    await requireRootUser();
    const { id } = await params;
    const run = await loadOrNotFound(() =>
        api.accounting.runs.get({ id: routeIdOrNotFound(id) }),
    );
    await api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <RunDetail initial={run} />
        </HydrateClient>
    );
}
