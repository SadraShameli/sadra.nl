import { PlugZap } from 'lucide-react';
import Link from 'next/link';

import { Button } from '~/components/ui/button';
import {
    EmptyState,
    EmptyStatePanel,
    type EmptyStateSize,
} from '~/components/ui/empty-state';
import { CredentialRole } from '~/lib/accounting/credentials/index';
import { routes } from '~/lib/site/routes';

const NO_CONNECTION_TITLE: Readonly<Record<CredentialRole, string>> = {
    [CredentialRole.Accounting]: 'No accounting connection',
    [CredentialRole.Transactions]: 'No transaction source',
};

const NO_CONNECTION_DESCRIPTION: Readonly<Record<CredentialRole, string>> = {
    [CredentialRole.Accounting]:
        'Add the accounting backend under Connections to load its data.',
    [CredentialRole.Transactions]:
        'Add a bank or a CSV source under Connections to read its transactions.',
};

export function NoConnectionPanel({ role }: { readonly role: CredentialRole }) {
    return <EmptyStatePanel {...noConnectionProperties(role)} />;
}

export function NoConnectionState({
    role,
    size,
}: {
    readonly role: CredentialRole;
    readonly size?: EmptyStateSize;
}) {
    return <EmptyState {...noConnectionProperties(role)} size={size} />;
}

function noConnectionProperties(role: CredentialRole) {
    return {
        action: (
            <Button asChild variant="outline">
                <Link href={routes.accounting.connections}>
                    Open connections
                </Link>
            </Button>
        ),
        description: NO_CONNECTION_DESCRIPTION[role],
        icon: PlugZap,
        title: NO_CONNECTION_TITLE[role],
    };
}
