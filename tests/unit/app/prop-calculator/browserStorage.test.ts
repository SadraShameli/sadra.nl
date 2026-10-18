import { describe, expect, it } from 'vitest';

import {
    localStorageOrNull,
    sessionStorageOrNull,
} from '~/app/(app)/prop-calculator/_components/browserStorage';

describe('browser storage accessors on the server', () => {
    it('returns null for both storages without a window', () => {
        expect(typeof window).toBe('undefined');
        expect(localStorageOrNull()).toBeNull();
        expect(sessionStorageOrNull()).toBeNull();
    });
});
