import { describe, expect, it } from 'vitest';

import {
    isAdminOrAbove,
    isRoot,
    resolveRole,
    ROOT_EMAIL,
} from '~/lib/auth/roles';

describe('isRoot', () => {
    it('is true only for the root role', () => {
        expect(isRoot('root')).toBe(true);
        expect(isRoot('admin')).toBe(false);
        expect(isRoot('user')).toBe(false);
    });
});

describe('isAdminOrAbove', () => {
    it('accepts admin and root', () => {
        expect(isAdminOrAbove('root')).toBe(true);
        expect(isAdminOrAbove('admin')).toBe(true);
    });

    it('rejects regular users', () => {
        expect(isAdminOrAbove('user')).toBe(false);
    });
});

describe('resolveRole', () => {
    it('promotes the ROOT_EMAIL address to root regardless of dbRole', () => {
        expect(resolveRole(ROOT_EMAIL, null)).toBe('root');
        expect(resolveRole(ROOT_EMAIL, 'user')).toBe('root');
        expect(resolveRole(ROOT_EMAIL, 'admin')).toBe('root');
    });

    it('matches ROOT_EMAIL case-insensitively', () => {
        expect(resolveRole(ROOT_EMAIL.toUpperCase(), null)).toBe('root');
    });

    it('uses dbRole=root when set on a non-root email', () => {
        expect(resolveRole('someone@example.test', 'root')).toBe('root');
    });

    it('uses dbRole=admin when set on a non-root email', () => {
        expect(resolveRole('someone@example.test', 'admin')).toBe('admin');
    });

    it('defaults to user when dbRole is missing or unknown', () => {
        expect(resolveRole('someone@example.test', null)).toBe('user');
        expect(resolveRole('someone@example.test', 'garbage')).toBe('user');
    });

    it('defaults to user when email is missing', () => {
        expect(resolveRole(null, null)).toBe('user');
        expect(resolveRole(undefined, null)).toBe('user');
    });
});
