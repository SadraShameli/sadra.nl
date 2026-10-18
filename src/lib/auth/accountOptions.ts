import type { BetterAuthOptions } from 'better-auth';

export const authAccountOptions = {
    accountLinking: {
        enabled: true,
        requireLocalEmailVerified: true,
        trustedProviders: ['google', 'github'],
    },
    encryptOAuthTokens: true,
} satisfies BetterAuthOptions['account'];
