import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';

import { authUserOptions } from '~/lib/auth/userOptions';

const PASSWORD = 'Quartz-Lantern-Harbor-97';

type TestAuth = ReturnType<typeof buildAuth>;

function buildAuth(sendVerificationEmail = vi.fn()) {
    return betterAuth({
        baseURL: 'http://localhost:3000',
        database: memoryAdapter({
            account: [],
            session: [],
            user: [],
            verification: [],
        }),
        emailAndPassword: { enabled: true },
        emailVerification: { sendVerificationEmail },
        secret: 'user-options-test-secret-0123456789',
        user: authUserOptions,
    });
}

async function signedInMember(
    auth: TestAuth,
    email: string,
): Promise<{ headers: Headers; id: string }> {
    const created = await auth.api.signUpEmail({
        body: { email, name: email, password: PASSWORD },
    });
    const context = await auth.$context;
    await context.internalAdapter.updateUser(created.user.id, {
        emailVerified: true,
    });
    const response = await auth.api.signInEmail({
        asResponse: true,
        body: { email, password: PASSWORD },
    });
    const cookies = response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';', 1)[0]);
    const headers = new Headers();
    headers.set('cookie', cookies.join('; '));
    return { headers, id: created.user.id };
}

describe('authUserOptions', () => {
    it('lets a signed-in user delete their own account', async () => {
        const auth = buildAuth();
        const member = await signedInMember(auth, 'leaving@x.test');

        await auth.api.deleteUser({ body: {}, headers: member.headers });

        const context = await auth.$context;
        await expect(
            context.internalAdapter.findUserById(member.id),
        ).resolves.toBeNull();
    });

    it('sends a verification link to the new address when a user changes email', async () => {
        const sendVerificationEmail = vi.fn();
        const auth = buildAuth(sendVerificationEmail);
        const member = await signedInMember(auth, 'old@x.test');

        await auth.api.changeEmail({
            body: { newEmail: 'new@x.test' },
            headers: member.headers,
        });

        expect(sendVerificationEmail).toHaveBeenCalledOnce();
        const context = await auth.$context;
        const stored = await context.internalAdapter.findUserById(member.id);
        expect(stored?.email).toBe('old@x.test');
    });
});
