import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';

import { authBackgroundTasks } from '~/lib/auth/backgroundTasks';
import {
    authEmailAndPasswordOptions,
    type PasswordResetSender,
} from '~/lib/auth/emailAndPasswordOptions';

const scheduled = vi.hoisted(() => ({ tasks: [] as unknown[] }));

vi.mock('next/server', () => ({
    after: (task: unknown) => {
        scheduled.tasks.push(task);
    },
}));

const PASSWORD = 'Quartz-Lantern-Harbor-97';

function buildAuth(sendPasswordReset: PasswordResetSender) {
    return betterAuth({
        advanced: { backgroundTasks: authBackgroundTasks },
        baseURL: 'http://localhost:3000',
        database: memoryAdapter({
            account: [],
            session: [],
            user: [],
            verification: [],
        }),
        emailAndPassword: authEmailAndPasswordOptions(sendPasswordReset),
        emailVerification: { sendVerificationEmail: vi.fn() },
        secret: 'background-tasks-test-secret-0123456789',
    });
}

describe('authBackgroundTasks', () => {
    it('answers a reset request for a known account without waiting for the email', async () => {
        const auth = buildAuth(
            () => Promise.withResolvers<undefined>().promise,
        );
        await auth.api.signUpEmail({
            body: { email: 'known@x.test', name: 'Known', password: PASSWORD },
        });

        const answer = await auth.api.requestPasswordReset({
            body: { email: 'known@x.test' },
        });

        expect(answer.status).toBe(true);
        expect(scheduled.tasks).toHaveLength(1);
    });
});
