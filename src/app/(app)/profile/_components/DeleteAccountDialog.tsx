'use client';

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
import { authClient } from '~/lib/auth/client';
import { EmailLink, emailLinkSentText } from '~/lib/auth/EmailLink';
import { routes } from '~/lib/site/routes';

export function DeleteAccountDialog() {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    className={'app-profile__delete-account'}
                    type="button"
                    variant="destructive"
                >
                    Delete account
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete account</AlertDialogTitle>
                    <AlertDialogDescription>
                        We'll email you a link to confirm. Opening it
                        permanently deletes your account and all associated
                        data. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => void requestAccountDeletion()}
                    >
                        Delete account
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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
