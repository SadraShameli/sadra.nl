'use client';

import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { authClient } from '~/lib/auth/client';
import { EmailLink, emailLinkSentText } from '~/lib/auth/EmailLink';
import { routes } from '~/lib/site/routes';

export function DeleteAccountDialog() {
    return (
        <ConfirmDialog
            confirmLabel="Delete account"
            description="We'll email you a link to confirm. Opening it permanently deletes your account and all associated data. This action cannot be undone."
            onConfirm={() => void requestAccountDeletion()}
            title="Delete account"
        >
            <Button
                className={'app-profile__delete-account'}
                type="button"
                variant="destructive"
            >
                Delete account
            </Button>
        </ConfirmDialog>
    );
}

async function requestAccountDeletion(): Promise<void> {
    const result = await authClient.deleteUser({
        callbackURL: routes.home,
    });
    if (result.error) {
        toast.error(result.error.message ?? 'Could not delete your account.');
        return;
    }
    toast.success(emailLinkSentText(EmailLink.AccountDeletion));
}
