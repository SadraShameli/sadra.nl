'use client';

import { matchQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Button } from '~/components/ui/Button';
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
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    aria-label={`Delete ${label}`}
                    disabled={remove.isPending}
                    size="icon"
                    variant="ghost"
                >
                    <Trash2 />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Delete &ldquo;{label}&rdquo;?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This permanently removes the account with its balances,
                        payouts, fees, events and sizing decisions. Archive it
                        instead to keep its history in your totals.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            remove.mutate({ id: accountId });
                        }}
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
