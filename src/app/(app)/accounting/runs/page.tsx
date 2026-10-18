import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { RunsBrowser } from '~/app/(app)/accounting/_components/RunsBrowser';
import { requireRootUser } from '~/lib/auth/guards';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Runs · Accounting Importer',
};

export default function RunsPage() {
    return (
        <AccountingPageFrame
            className="app-accounting__runs"
            section={AccountingSection.Runs}
        >
            <RunsContent />
        </AccountingPageFrame>
    );
}

async function RunsContent() {
    await requireRootUser();
    await api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <RunsBrowser />
        </HydrateClient>
    );
}
