export const ROOT_EMAIL = 'sadra.shameli1@gmail.com';

export type Role = 'admin' | 'root' | 'user';

export function resolveRole(
    email: null | string | undefined,
    dbRole: null | string | undefined,
): Role {
    if (email?.toLowerCase() === ROOT_EMAIL) return 'root';
    if (dbRole === 'root') return 'root';
    if (dbRole === 'admin') return 'admin';
    return 'user';
}

export const isAdminOrAbove = (r: Role) => r === 'admin' || r === 'root';
export const isRoot = (r: Role) => r === 'root';
