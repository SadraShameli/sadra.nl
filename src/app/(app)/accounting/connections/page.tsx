import { type Metadata } from 'next';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import { AccountingSection } from '~/app/(app)/accounting/_components/AccountingSection';
import { ConnectionsManager } from '~/app/(app)/accounting/_components/ConnectionsManager';
import { NewCredentialDialog } from '~/app/(app)/accounting/_components/NewCredentialDialog';
import { requireRootUser } from '~/lib/auth/guards';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Connections · Accounting Importer',
};

export default function ConnectionsPage() {
    return (
        <AccountingPageFrame
            actions={<NewCredentialDialog />}
            className="app-accounting__connections"
            section={AccountingSection.Connections}
        >
            <ConnectionsContent />
        </AccountingPageFrame>
    );
}

async function ConnectionsContent() {
    await requireRootUser();
    return <ConnectionsManager />;
}
