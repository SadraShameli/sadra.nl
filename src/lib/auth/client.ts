import { adminClient, magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { env } from '~/env';
import { ac, roles } from '~/lib/auth/permissions';

export const authClient = createAuthClient({
    baseURL: env.NEXT_PUBLIC_SERVER_URL,
    plugins: [magicLinkClient(), adminClient({ ac, roles })],
});

export const { signIn, signOut, signUp, useSession } = authClient;
