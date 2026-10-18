import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { MutationsBrowser } from '~/app/(app)/accounting/_components/MutationsBrowser';
import { requireRootUser } from '~/lib/auth/guards';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Mutations · Accounting Importer',
};

export default function MutationsPage() {
    return (
        <AccountingPageFrame
            className="app-accounting__mutations"
            section={AccountingSection.Mutations}
        >
            <MutationsContent />
        </AccountingPageFrame>
    );
}

async function MutationsContent() {
    await requireRootUser();
    await api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <MutationsBrowser />
        </HydrateClient>
    );
}
