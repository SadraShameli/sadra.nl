import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { admin } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';

import { adminPluginOptions } from '~/lib/auth/permissions';
import { enforceRoleHierarchy } from '~/lib/auth/RoleHierarchy';
import { ROLE, type Role } from '~/lib/auth/roles';

const PASSWORD = 'Quartz-Lantern-Harbor-97';

interface Member {
    readonly headers: Headers;
    readonly id: string;
}

type TestAuth = ReturnType<typeof buildAuth>;

function buildAuth() {
    return betterAuth({
        baseURL: 'http://localhost:3000',
        database: memoryAdapter({
            account: [],
            session: [],
            user: [],
            verification: [],
        }),
        emailAndPassword: { enabled: true },
        hooks: { before: enforceRoleHierarchy },
        plugins: [admin(adminPluginOptions)],
        secret: 'role-hierarchy-test-secret-0123456789',
    });
}

async function memberWithRole(
    auth: TestAuth,
    email: string,
    role: Role,
): Promise<Member> {
    const created = await auth.api.signUpEmail({
        body: { email, name: email, password: PASSWORD },
    });
    const context = await auth.$context;
    await context.internalAdapter.updateUser(created.user.id, { role });
    const response = await auth.api.signInEmail({
        asResponse: true,
        body: { email, password: PASSWORD },
    });
    const headers = new Headers();
    headers.set(
        'cookie',
        response.headers
            .getSetCookie()
            .map((cookie) => cookie.split(';', 1)[0])
            .join('; '),
    );
    return { headers, id: created.user.id };
}

async function roleOf(auth: TestAuth, userId: string): Promise<unknown> {
    const context = await auth.$context;
    const user = await context.internalAdapter.findUserById(userId);
    return user === null ? null : Reflect.get(user, 'role');
}

describe('enforceRoleHierarchy', () => {
    it('stops an admin from promoting itself to root', async () => {
        const auth = buildAuth();
        const actor = await memberWithRole(auth, 'admin@x.test', ROLE.ADMIN);

        await expect(
            auth.api.setRole({
                body: { role: ROLE.ROOT, userId: actor.id },
                headers: actor.headers,
            }),
        ).rejects.toThrow();
        await expect(roleOf(auth, actor.id)).resolves.toBe(ROLE.ADMIN);
    });

    it('stops an admin from resetting a root user password or removing a root user', async () => {
        const auth = buildAuth();
        const actor = await memberWithRole(auth, 'admin@x.test', ROLE.ADMIN);
        const owner = await memberWithRole(auth, 'root@x.test', ROLE.ROOT);

        await expect(
            auth.api.setUserPassword({
                body: { newPassword: `${PASSWORD}-new`, userId: owner.id },
                headers: actor.headers,
            }),
        ).rejects.toThrow();
        await expect(
            auth.api.removeUser({
                body: { userId: owner.id },
                headers: actor.headers,
            }),
        ).rejects.toThrow();
        await expect(roleOf(auth, owner.id)).resolves.toBe(ROLE.ROOT);
    });

    it('stops an admin from demoting a root user', async () => {
        const auth = buildAuth();
        const actor = await memberWithRole(auth, 'admin@x.test', ROLE.ADMIN);
        const owner = await memberWithRole(auth, 'root@x.test', ROLE.ROOT);

        await expect(
            auth.api.setRole({
                body: { role: ROLE.USER, userId: owner.id },
                headers: actor.headers,
            }),
        ).rejects.toThrow();
        await expect(roleOf(auth, owner.id)).resolves.toBe(ROLE.ROOT);
    });

    it('lets an admin promote a regular user to admin', async () => {
        const auth = buildAuth();
        const actor = await memberWithRole(auth, 'admin@x.test', ROLE.ADMIN);
        const member = await memberWithRole(auth, 'user@x.test', ROLE.USER);

        await auth.api.setRole({
            body: { role: ROLE.ADMIN, userId: member.id },
            headers: actor.headers,
        });
        await expect(roleOf(auth, member.id)).resolves.toBe(ROLE.ADMIN);
    });

    it('lets a root user promote an admin to root', async () => {
        const auth = buildAuth();
        const owner = await memberWithRole(auth, 'root@x.test', ROLE.ROOT);
        const actor = await memberWithRole(auth, 'admin@x.test', ROLE.ADMIN);

        await auth.api.setRole({
            body: { role: ROLE.ROOT, userId: actor.id },
            headers: owner.headers,
        });
        await expect(roleOf(auth, actor.id)).resolves.toBe(ROLE.ROOT);
    });
});
