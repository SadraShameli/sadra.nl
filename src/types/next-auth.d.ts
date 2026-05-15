import type { DefaultSession } from 'next-auth';

import type { Role } from '~/lib/auth-roles';

declare module 'next-auth' {
    interface Session {
        user: DefaultSession['user'] & {
            id: string;
            role: Role;
        };
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        sessionToken?: string;
        userId?: string;
    }
}
