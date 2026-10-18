import type { BetterAuthOptions } from 'better-auth';

const MIN_PASSWORD_LENGTH = 12;

export type PasswordResetSender = (to: string, url: string) => Promise<void>;

export function authEmailAndPasswordOptions(
    sendPasswordReset: PasswordResetSender,
) {
    return {
        enabled: true,
        minPasswordLength: MIN_PASSWORD_LENGTH,
        requireEmailVerification: true,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ url, user }) => {
            await sendPasswordReset(user.email, url);
        },
    } satisfies BetterAuthOptions['emailAndPassword'];
}
