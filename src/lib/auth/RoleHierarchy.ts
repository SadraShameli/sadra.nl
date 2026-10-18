import {
    APIError,
    createAuthMiddleware,
    getSessionFromCtx,
} from 'better-auth/api';
import { z } from 'zod';

import { isRoot } from '~/lib/auth/roles';

enum UserAdminPath {
    BanUser = '/admin/ban-user',
    CreateUser = '/admin/create-user',
    ImpersonateUser = '/admin/impersonate-user',
    RemoveUser = '/admin/remove-user',
    RevokeUserSession = '/admin/revoke-user-session',
    RevokeUserSessions = '/admin/revoke-user-sessions',
    SetRole = '/admin/set-role',
    SetUserPassword = '/admin/set-user-password',
    UnbanUser = '/admin/unban-user',
    UpdateUser = '/admin/update-user',
}

const USER_ADMIN_PATHS: ReadonlySet<string> = new Set(
    Object.values(UserAdminPath),
);

const requestedRoleSchema = z.union([z.string(), z.array(z.string())]);

const userAdminBodySchema = z.object({
    data: z.object({ role: requestedRoleSchema.optional() }).optional(),
    role: requestedRoleSchema.optional(),
    sessionToken: z.string().optional(),
    userId: z.string().optional(),
});

type UserAdminBody = z.infer<typeof userAdminBodySchema>;

const actorSchema = z.object({ role: z.string().nullish() });

const targetSchema = z.object({ role: z.string().nullish() });

function isAboveActorRole(
    actorRole: null | string | undefined,
    targetRole: null | string | undefined,
    requestedRoles: readonly string[],
): boolean {
    return (
        !isRoot(actorRole) &&
        (isRoot(targetRole) || requestedRoles.some((role) => isRoot(role)))
    );
}

function rolesOf(requested: string | string[] | undefined): string[] {
    if (requested === undefined) return [];
    return typeof requested === 'string' ? requested.split(',') : requested;
}

export const enforceRoleHierarchy = createAuthMiddleware(async (context) => {
    if (!USER_ADMIN_PATHS.has(context.path)) return;
    const session = await getSessionFromCtx(context);
    if (session === null) return;
    const body = userAdminBodySchema.safeParse(context.body ?? {});
    if (!body.success) return;
    const targetRole = await targetRoleOf(context, body.data);
    const actorRole = actorSchema.parse(session.user).role;
    const requestedRoles = [
        ...rolesOf(body.data.role),
        ...rolesOf(body.data.data?.role),
    ];
    if (isAboveActorRole(actorRole, targetRole, requestedRoles)) {
        throw new APIError('FORBIDDEN', {
            message:
                'Only a root user can manage a root user or grant the root role',
        });
    }
});

type MiddlewareContext = Parameters<
    Parameters<typeof createAuthMiddleware>[0]
>[0];

async function targetRoleOf(
    context: MiddlewareContext,
    body: UserAdminBody,
): Promise<null | string | undefined> {
    const adapter = context.context.internalAdapter;
    if (body.userId !== undefined) {
        const user = await adapter.findUserById(body.userId);
        return user === null ? null : targetSchema.parse(user).role;
    }
    if (body.sessionToken !== undefined) {
        const found = await adapter.findSession(body.sessionToken);
        return found === null ? null : targetSchema.parse(found.user).role;
    }
    return null;
}
