'use client';

import { matchQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { toast } from 'sonner';

import { api } from '~/trpc/react';

export const ACCOUNT_DELETE_DESCRIPTION =
    'This permanently removes the account with its balances, payouts, fees, events and sizing decisions. Archive it instead to keep its history in your totals.';

export interface LifecycleAccount {
    readonly archivedAt: Date | null;
    readonly id: string;
    readonly label: string;
}

interface AccountArchiving {
    readonly isPendingFor: (accountId: string) => boolean;
    readonly toggle: (account: LifecycleAccount) => void;
}

interface AccountRemoval {
    readonly isPendingFor: (accountId: string) => boolean;
    readonly remove: (account: Pick<LifecycleAccount, 'id' | 'label'>) => void;
}

export function accountDeleteTitle(label: string): string {
    return `Delete “${label}”?`;
}

export function useAccountArchiving(): AccountArchiving {
    const utilities = api.useUtils();
    const invalidate = () => utilities.propAccounts.account.invalidate();
    const archive = api.propAccounts.account.archive.useMutation({
        onError: reportError,
        onSuccess: invalidate,
    });
    const unarchive = api.propAccounts.account.unarchive.useMutation({
        onError: reportError,
        onSuccess: invalidate,
    });
    return {
        isPendingFor: (accountId) =>
            (archive.isPending && archive.variables.id === accountId) ||
            (unarchive.isPending && unarchive.variables.id === accountId),
        toggle: (account) => {
            if (account.archivedAt === null) {
                archive.mutate(
                    { id: account.id },
                    {
                        onSuccess: () => {
                            toast.success(`${account.label} archived`);
                        },
                    },
                );
                return;
            }
            unarchive.mutate(
                { id: account.id },
                {
                    onSuccess: () => {
                        toast.success(`${account.label} restored`);
                    },
                },
            );
        },
    };
}

export function useAccountRemoval(onDeleted?: () => void): AccountRemoval {
    const utilities = api.useUtils();
    const removal = api.propAccounts.account.remove.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
        onSuccess: async (_result, { id }) => {
            const deletedAccount = {
                queryKey: getQueryKey(
                    api.propAccounts.account.get,
                    { id },
                    'query',
                ),
            };
            await utilities.propAccounts.account.get.cancel({ id });
            await utilities.propAccounts.invalidate(undefined, {
                predicate: (query) => !matchQuery(deletedAccount, query),
            });
            onDeleted?.();
        },
    });
    return {
        isPendingFor: (accountId) =>
            removal.isPending && removal.variables.id === accountId,
        remove: (account) => {
            removal.mutate(
                { id: account.id },
                {
                    onSuccess: () => {
                        toast.success(`${account.label} deleted`);
                    },
                },
            );
        },
    };
}

function reportError(error: { readonly message: string }): void {
    toast.error(error.message);
}
