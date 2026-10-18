import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { RulesManager } from '~/app/(app)/accounting/_components/RulesManager';
import { requireRootUser } from '~/lib/auth/guards';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Booking rules · Accounting Importer',
};

export default function RulesPage() {
    return (
        <AccountingPageFrame
            className="app-accounting__rules"
            section={AccountingSection.Rules}
        >
            <RulesContent />
        </AccountingPageFrame>
    );
}

async function RulesContent() {
    await requireRootUser();
    await api.accounting.credentials.list.prefetch();
    return (
        <HydrateClient>
            <RulesManager />
        </HydrateClient>
    );
}
