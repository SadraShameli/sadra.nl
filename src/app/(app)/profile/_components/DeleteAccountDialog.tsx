'use client';

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
import { deleteAccount } from '~/lib/auth-actions';

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
                        This will permanently delete your account and all
                        associated data. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteAccount()}>
                        Delete account
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
