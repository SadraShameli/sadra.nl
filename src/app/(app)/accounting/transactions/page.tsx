import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { TransactionsBrowser } from '~/app/(app)/accounting/_components/TransactionsBrowser';
import { requireRootUser } from '~/lib/auth/guards';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Transactions · Accounting Importer',
};

export default function TransactionsPage() {
    return (
        <AccountingPageFrame
            className="app-accounting__transactions"
            section={AccountingSection.Transactions}
        >
            <TransactionsContent />
        </AccountingPageFrame>
    );
}

async function TransactionsContent() {
    await requireRootUser();
    await prefetch(trpc.accounting.credentials.list.queryOptions());
    return (
        <HydrateClient>
            <TransactionsBrowser />
        </HydrateClient>
    );
}
