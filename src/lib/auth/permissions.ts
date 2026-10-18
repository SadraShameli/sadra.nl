import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

import { ROLE } from '~/lib/auth/roles';

const statement = {
    ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

export const userRole = ac.newRole({
    session: [],
    user: [],
});

export const adminRole = ac.newRole({
    ...adminAc.statements,
});

export const rootRole = ac.newRole({
    ...adminAc.statements,
});

export const roles = {
    admin: adminRole,
    root: rootRole,
    user: userRole,
} as const;

export const adminPluginOptions = {
    ac,
    adminRoles: [ROLE.ADMIN, ROLE.ROOT],
    defaultRole: ROLE.USER,
    roles,
};
