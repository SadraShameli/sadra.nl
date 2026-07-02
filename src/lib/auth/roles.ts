export const ROOT_EMAIL = 'sadra.shameli1@gmail.com';

export const ROLE_VALUES = ['admin', 'root', 'user'] as const;
export type Role = (typeof ROLE_VALUES)[number];

export const ROLE = {
    ADMIN: 'admin',
    ROOT: 'root',
    USER: 'user',
} as const satisfies Record<string, Role>;

export function resolveRole(
    _email: null | string | undefined,
    databaseRole: null | string | undefined,
): Role {
    if (databaseRole === ROLE.ROOT) return ROLE.ROOT;
    if (databaseRole === ROLE.ADMIN) return ROLE.ADMIN;
    return ROLE.USER;
}

export const isAdminOrAbove = (r: null | string | undefined): boolean =>
    r === ROLE.ADMIN || r === ROLE.ROOT;
export const isRoot = (r: null | string | undefined): boolean =>
    r === ROLE.ROOT;
