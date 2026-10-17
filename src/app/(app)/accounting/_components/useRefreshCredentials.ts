import { api } from '~/trpc/react';

export function useRefreshCredentials(): () => Promise<void> {
    const utilities = api.useUtils();
    return async () => {
        await utilities.accounting.credentials.list.invalidate();
        await utilities.accounting.summary.invalidate();
    };
}
