import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    localStorageOrNull,
    sessionStorageOrNull,
} from '~/app/(app)/prop-calculator/_components/browserStorage';

describe('browser storage accessors in the browser', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the local and session storage of the window', () => {
        expect(localStorageOrNull()).toBe(window.localStorage);
        expect(sessionStorageOrNull()).toBe(window.sessionStorage);
    });

    it('returns null when the browser refuses local storage', () => {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        expect(localStorageOrNull()).toBeNull();
        expect(sessionStorageOrNull()).toBe(window.sessionStorage);
    });

    it('returns null when the browser refuses session storage', () => {
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        expect(sessionStorageOrNull()).toBeNull();
        expect(localStorageOrNull()).toBe(window.localStorage);
    });
});
