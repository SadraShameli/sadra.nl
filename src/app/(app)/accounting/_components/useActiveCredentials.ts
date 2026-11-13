'use client';

import { useQuery } from '@tanstack/react-query';

import {
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/index';
import { useTRPC } from '~/trpc/react';

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
    const api = useTRPC();
    const credentialsQ = useQuery(
        api.accounting.credentials.list.queryOptions(),
    );
    const all = credentialsQ.data ?? [];

    const listByRole = (role: CredentialRole): ActiveCredential[] =>
        all.filter(
            (c) => CredentialRegistry.instance.get(c.kind)?.role === role,
        );
    const resolve = (role: CredentialRole): ActiveCredential | undefined => {
        const ofRole = listByRole(role);
        return ofRole.find((c) => c.isActive) ?? ofRole[0];
    };

    return {
        accounting: resolve(CredentialRole.Accounting),
        isLoading: credentialsQ.isPending,
        source: resolve(CredentialRole.Transactions),
        sources: listByRole(CredentialRole.Transactions),
    };
}
