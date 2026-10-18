import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it, vi } from 'vitest';

import { authAuditHooks } from '~/lib/auth/AuditTrail';

const audited = vi.hoisted(() => {
    const lines: { fields?: object; message: string }[] = [];
    return {
        lines,
        record: (message: string, fields?: object) => {
            lines.push({ fields, message });
        },
    };
});

vi.mock('server-only', () => ({}));
vi.mock('~/lib/observability/logger', () => ({
    logger: { info: audited.record },
}));

const EMAIL = 'audited@x.test';
const PASSWORD = 'Quartz-Lantern-Harbor-97';

describe('authAuditHooks', () => {
    it('records account links, sessions and user changes by user id only', async () => {
        const auth = betterAuth({
            baseURL: 'http://localhost:3000',
            database: memoryAdapter({
                account: [],
                session: [],
                user: [],
                verification: [],
            }),
            databaseHooks: authAuditHooks,
            emailAndPassword: { enabled: true },
            secret: 'audit-trail-test-secret-0123456789',
        });

        const created = await auth.api.signUpEmail({
            body: { email: EMAIL, name: 'Audited', password: PASSWORD },
        });
        await auth.api.signInEmail({
            body: { email: EMAIL, password: PASSWORD },
        });
        const context = await auth.$context;
        await context.internalAdapter.updateUser(created.user.id, {
            name: 'Renamed',
        });

        expect(audited.lines.map((line) => line.message)).toEqual(
            expect.arrayContaining([
                '[auth.audit] account linked',
                '[auth.audit] session created',
                '[auth.audit] user updated',
            ]),
        );
        expect(JSON.stringify(audited.lines)).toContain(created.user.id);
        expect(JSON.stringify(audited.lines)).not.toContain(EMAIL);
    });
});
