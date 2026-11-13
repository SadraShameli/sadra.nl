import { useQueryClient } from '@tanstack/react-query';

import { useTRPC } from '~/trpc/react';

export function useRefreshCredentials(): () => Promise<void> {
    const api = useTRPC();
    const queryClient = useQueryClient();
    return async () => {
        await queryClient.invalidateQueries(
            api.accounting.credentials.list.pathFilter(),
        );
        await queryClient.invalidateQueries(
            api.accounting.summary.pathFilter(),
        );
    };
}
