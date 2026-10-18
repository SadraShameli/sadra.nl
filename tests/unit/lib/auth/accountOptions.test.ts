import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { setTokenUtil } from 'better-auth/oauth2';
import { describe, expect, it } from 'vitest';

import { authAccountOptions } from '~/lib/auth/accountOptions';

const ACCESS_TOKEN = 'gho_plaintext0provider0access0token';

describe('authAccountOptions', () => {
    it('encrypts OAuth tokens before they are stored', async () => {
        const options: BetterAuthOptions = {
            account: authAccountOptions,
            baseURL: 'http://localhost:3000',
            database: memoryAdapter({
                account: [],
                session: [],
                user: [],
                verification: [],
            }),
            secret: 'account-options-test-secret-0123456789',
        };
        const auth = betterAuth(options);

        const stored = await setTokenUtil(ACCESS_TOKEN, await auth.$context);

        expect(stored).not.toContain(ACCESS_TOKEN);
    });
});
