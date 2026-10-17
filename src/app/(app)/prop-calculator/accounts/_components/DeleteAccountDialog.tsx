'use client';

import { matchQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { api } from '~/trpc/react';

interface DeleteAccountDialogProperties {
    accountId: string;
    label: string;
    onDeleted?: () => void;
}

export function DeleteAccountDialog({
    accountId,
    label,
    onDeleted,
}: DeleteAccountDialogProperties) {
    const utilities = api.useUtils();
    const remove = api.propAccounts.account.remove.useMutation({
        onError: (error) => {
            toast.error(error.message);
        },
        onSuccess: async () => {
            toast.success(`${label} deleted`);
            const deletedAccount = {
                queryKey: getQueryKey(
                    api.propAccounts.account.get,
                    { id: accountId },
                    'query',
                ),
            };
            await utilities.propAccounts.account.get.cancel({ id: accountId });
            await utilities.propAccounts.invalidate(undefined, {
                predicate: (query) => !matchQuery(deletedAccount, query),
            });
            onDeleted?.();
        },
    });

    return (
        <ConfirmDialog
            confirmLabel="Delete"
            description="This permanently removes the account with its balances, payouts, fees, events and sizing decisions. Archive it instead to keep its history in your totals."
            onConfirm={() => {
                remove.mutate({ id: accountId });
            }}
            title={<>Delete &ldquo;{label}&rdquo;?</>}
        >
            <Button
                aria-label={`Delete ${label}`}
                disabled={remove.isPending}
                size="icon"
                variant="ghost"
            >
                <Trash2 />
            </Button>
        </ConfirmDialog>
    );
}
