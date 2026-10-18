import type { BetterAuthOptions } from 'better-auth';

import { EMAIL_LINK_LIFETIME_SECONDS, EmailLink } from '~/lib/auth/EmailLink';

export interface AccountEmailSender {
    confirmAccountDeletion(to: string, url: string): Promise<void>;
    confirmEmailChange(
        to: string,
        newEmail: string,
        url: string,
    ): Promise<void>;
}

export function authUserOptions(sender: AccountEmailSender) {
    return {
        changeEmail: {
            enabled: true,
            sendChangeEmailConfirmation: async ({ newEmail, url, user }) => {
                await sender.confirmEmailChange(user.email, newEmail, url);
            },
        },
        deleteUser: {
            deleteTokenExpiresIn:
                EMAIL_LINK_LIFETIME_SECONDS[EmailLink.AccountDeletion],
            enabled: true,
            sendDeleteAccountVerification: async ({ url, user }) => {
                await sender.confirmAccountDeletion(user.email, url);
            },
        },
    } satisfies BetterAuthOptions['user'];
}
