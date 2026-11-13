import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { LedgersBrowser } from '~/app/(app)/accounting/_components/LedgersBrowser';
import { requireRootUser } from '~/lib/auth/guards';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Ledgers · Accounting Importer',
};

export default function LedgersPage() {
    return (
        <AccountingPageFrame
            className="app-accounting__ledgers"
            section={AccountingSection.Ledgers}
        >
            <LedgersContent />
        </AccountingPageFrame>
    );
}

async function LedgersContent() {
    await requireRootUser();
    await prefetch(trpc.accounting.credentials.list.queryOptions());
    return (
        <HydrateClient>
            <LedgersBrowser />
        </HydrateClient>
    );
}
