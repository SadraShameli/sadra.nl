import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';

import {
    type AccountEmailSender,
    authUserOptions,
} from '~/lib/auth/userOptions';

const PASSWORD = 'Quartz-Lantern-Harbor-97';

interface RecordingSender extends AccountEmailSender {
    readonly confirmAccountDeletion: ReturnType<
        typeof vi.fn<AccountEmailSender['confirmAccountDeletion']>
    >;
    readonly confirmEmailChange: ReturnType<
        typeof vi.fn<AccountEmailSender['confirmEmailChange']>
    >;
}

type TestAuth = ReturnType<typeof buildAuth>;

function buildAuth(
    sender: AccountEmailSender = recordingSender(),
    sendVerificationEmail = vi.fn(),
) {
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
        user: authUserOptions(sender),
    });
}

function recordingSender(): RecordingSender {
    return {
        confirmAccountDeletion: vi.fn<
            AccountEmailSender['confirmAccountDeletion']
        >(() => Promise.resolve()),
        confirmEmailChange: vi.fn<AccountEmailSender['confirmEmailChange']>(
            () => Promise.resolve(),
        ),
    };
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

function tokenFrom(url: string): string {
    const token = new URL(url).searchParams.get('token');
    if (token === null) throw new TypeError(`no token in ${url}`);
    return token;
}

describe('authUserOptions', () => {
    it('asks for email confirmation before deleting an account', async () => {
        const sender = recordingSender();
        const auth = buildAuth(sender);
        const member = await signedInMember(auth, 'leaving@x.test');

        await auth.api.deleteUser({ body: {}, headers: member.headers });

        const context = await auth.$context;
        await expect(
            context.internalAdapter.findUserById(member.id),
        ).resolves.not.toBeNull();
        expect(sender.confirmAccountDeletion).toHaveBeenCalledOnce();
        const [to, url] = sender.confirmAccountDeletion.mock.calls[0] ?? [];
        expect(to).toBe('leaving@x.test');
        expect(url).toContain('/delete-user/callback');
    });

    it('deletes the account once the emailed link is opened', async () => {
        const sender = recordingSender();
        const auth = buildAuth(sender);
        const member = await signedInMember(auth, 'leaving@x.test');
        await auth.api.deleteUser({ body: {}, headers: member.headers });
        const [, url] = sender.confirmAccountDeletion.mock.calls[0] ?? [];
        if (url === undefined) throw new TypeError('no deletion link sent');

        await auth.api.deleteUserCallback({
            headers: member.headers,
            query: { token: tokenFrom(url) },
        });

        const context = await auth.$context;
        await expect(
            context.internalAdapter.findUserById(member.id),
        ).resolves.toBeNull();
    });

    it('asks the current address to approve an email change first', async () => {
        const sender = recordingSender();
        const sendVerificationEmail = vi.fn();
        const auth = buildAuth(sender, sendVerificationEmail);
        const member = await signedInMember(auth, 'old@x.test');

        await auth.api.changeEmail({
            body: { newEmail: 'new@x.test' },
            headers: member.headers,
        });

        expect(sendVerificationEmail).not.toHaveBeenCalled();
        expect(sender.confirmEmailChange).toHaveBeenCalledOnce();
        const [to, newEmail] = sender.confirmEmailChange.mock.calls[0] ?? [];
        expect(to).toBe('old@x.test');
        expect(newEmail).toBe('new@x.test');
        const context = await auth.$context;
        const stored = await context.internalAdapter.findUserById(member.id);
        expect(stored?.email).toBe('old@x.test');
    });
});
