import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { requireRootUser } from '~/lib/auth/guards';
import { HydrateClient, prefetch, trpc } from '~/trpc/server';

import { AccountingDashboard } from './_components/AccountingDashboard';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Accounting Importer',
};

export default function AccountingPage() {
    return (
        <AccountingPageFrame
            className="app-accounting__dashboard"
            section={AccountingSection.Dashboard}
        >
            <AccountingDashboardContent />
        </AccountingPageFrame>
    );
}

async function AccountingDashboardContent() {
    await requireRootUser();
    await Promise.all([
        prefetch(trpc.accounting.credentials.list.queryOptions()),
        prefetch(trpc.accounting.summary.queryOptions()),
    ]);
    return (
        <HydrateClient>
            <AccountingDashboard />
        </HydrateClient>
    );
}
