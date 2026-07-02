'use client';

import type { CredentialRole } from '~/lib/accounting/credentials/index';

import { CredentialRegistry } from '~/lib/accounting/credentials/index';
import { api } from '~/trpc/react';

export interface ActiveCredentials {
    accounting: ActiveCredential | undefined;
    isLoading: boolean;
    source: ActiveCredential | undefined;
    sources: ActiveCredential[];
}

interface ActiveCredential {
    id: string;
    isActive: boolean;
    kind: string;
    label: string;
}

export function useActiveCredentials(): ActiveCredentials {
    const credentialsQ = api.accounting.credentials.list.useQuery();
    const all = credentialsQ.data ?? [];

    const listByRole = (role: CredentialRole): ActiveCredential[] =>
        all.filter(
            (c) => CredentialRegistry.instance().get(c.kind)?.role === role,
        );
    const resolve = (role: CredentialRole): ActiveCredential | undefined => {
        const ofRole = listByRole(role);
        return ofRole.find((c) => c.isActive) ?? ofRole[0];
    };

    return {
        accounting: resolve('accounting'),
        isLoading: credentialsQ.isPending,
        source: resolve('transactions'),
        sources: listByRole('transactions'),
    };
}
