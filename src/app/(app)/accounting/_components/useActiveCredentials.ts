'use client';

import type { CredentialRole } from '~/lib/accounting/credentials/index';

import { getCredentialDescriptor } from '~/lib/accounting/credentials/index';
import { api } from '~/trpc/react';

export interface ActiveCredentials {
    accounting: ActiveCredential | undefined;
    isLoading: boolean;
    source: ActiveCredential | undefined;
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

    const resolve = (role: CredentialRole): ActiveCredential | undefined => {
        const ofRole = all.filter(
            (c) => getCredentialDescriptor(c.kind)?.role === role,
        );
        return ofRole.find((c) => c.isActive) ?? ofRole[0];
    };

    return {
        accounting: resolve('accounting'),
        isLoading: credentialsQ.isPending,
        source: resolve('transactions'),
    };
}
