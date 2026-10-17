import type { BetterAuthOptions } from 'better-auth';

export const authUserOptions = {
    changeEmail: { enabled: true },
    deleteUser: { enabled: true },
} satisfies BetterAuthOptions['user'];
