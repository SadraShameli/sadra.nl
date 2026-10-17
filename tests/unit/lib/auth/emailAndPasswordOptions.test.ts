import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';

import {
    authEmailAndPasswordOptions,
    type PasswordResetSender,
} from '~/lib/auth/emailAndPasswordOptions';

const PASSWORD = 'Quartz-Lantern-Harbor-97';
const NEW_PASSWORD = 'Copper-Meadow-Signal-41';
const EMAIL = 'reset@x.test';

function buildAuth(sendPasswordReset: PasswordResetSender) {
    return betterAuth({
        baseURL: 'http://localhost:3000',
        database: memoryAdapter({
            account: [],
            session: [],
            user: [],
            verification: [],
        }),
        emailAndPassword: authEmailAndPasswordOptions(sendPasswordReset),
        emailVerification: { sendVerificationEmail: vi.fn() },
        secret: 'email-password-test-secret-0123456789',
    });
}

describe('authEmailAndPasswordOptions', () => {
    it('signs out every existing session when the password is reset', async () => {
        const sendPasswordReset = vi.fn<PasswordResetSender>(() =>
            Promise.resolve(),
        );
        const auth = buildAuth(sendPasswordReset);
        const created = await auth.api.signUpEmail({
            body: { email: EMAIL, name: EMAIL, password: PASSWORD },
        });
        const context = await auth.$context;
        await context.internalAdapter.updateUser(created.user.id, {
            emailVerified: true,
        });
        await auth.api.signInEmail({
            body: { email: EMAIL, password: PASSWORD },
        });
        await auth.api.requestPasswordReset({ body: { email: EMAIL } });
        const [, url] = sendPasswordReset.mock.calls[0] ?? [];
        if (url === undefined) throw new TypeError('no reset link sent');
        const token = new URL(url).pathname.split('/').at(-1) ?? '';

        await auth.api.resetPassword({
            body: { newPassword: NEW_PASSWORD, token },
        });

        await expect(
            context.internalAdapter.listSessions(created.user.id),
        ).resolves.toEqual([]);
    });
});
