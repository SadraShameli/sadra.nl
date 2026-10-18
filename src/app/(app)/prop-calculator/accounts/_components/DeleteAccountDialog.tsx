'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';

import {
    ACCOUNT_DELETE_DESCRIPTION,
    accountDeleteTitle,
    useAccountRemoval,
} from './useAccountLifecycle';

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
    const removal = useAccountRemoval(onDeleted);

    return (
        <ConfirmDialog
            confirmLabel="Delete"
            description={ACCOUNT_DELETE_DESCRIPTION}
            onConfirm={() => {
                removal.remove({ id: accountId, label });
            }}
            title={accountDeleteTitle(label)}
        >
            <Button
                aria-label={`Delete ${label}`}
                disabled={removal.isPendingFor(accountId)}
                size="icon"
                variant="ghost"
            >
                <Trash2 />
            </Button>
        </ConfirmDialog>
    );
}
