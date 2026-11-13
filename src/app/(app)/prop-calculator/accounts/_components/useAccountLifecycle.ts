'use client';

import { matchQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useTRPC } from '~/trpc/react';

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
    const api = useTRPC();
    const queryClient = useQueryClient();
    const invalidate = () =>
        queryClient.invalidateQueries(api.propAccounts.account.pathFilter());
    const archive = useMutation(
        api.propAccounts.account.archive.mutationOptions({
            onError: reportError,
            onSuccess: invalidate,
        }),
    );
    const unarchive = useMutation(
        api.propAccounts.account.unarchive.mutationOptions({
            onError: reportError,
            onSuccess: invalidate,
        }),
    );
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
    const api = useTRPC();
    const queryClient = useQueryClient();
    const removal = useMutation(
        api.propAccounts.account.remove.mutationOptions({
            onError: (error) => {
                toast.error(error.message);
            },
            onSuccess: async (_result, { id }) => {
                const deletedAccount = {
                    queryKey: api.propAccounts.account.get.queryKey({ id }),
                };
                await queryClient.cancelQueries(
                    api.propAccounts.account.get.queryFilter({ id }),
                );
                await queryClient.invalidateQueries(
                    api.propAccounts.pathFilter({
                        predicate: (query) =>
                            !matchQuery(deletedAccount, query),
                    }),
                );
                onDeleted?.();
            },
        }),
    );
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
