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
    it('returns root when dbRole=root', () => {
        expect(resolveRole(ROOT_EMAIL, 'root')).toBe('root');
        expect(resolveRole('someone@example.test', 'root')).toBe('root');
        expect(resolveRole(null, 'root')).toBe('root');
    });

    it('returns admin when dbRole=admin', () => {
        expect(resolveRole('someone@example.test', 'admin')).toBe('admin');
        expect(resolveRole(ROOT_EMAIL, 'admin')).toBe('admin');
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
